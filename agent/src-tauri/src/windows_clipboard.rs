use std::{ptr::copy_nonoverlapping, sync::OnceLock, thread};

use image::{codecs::png::PngEncoder, ColorType, ImageEncoder};
use tauri::{AppHandle, Emitter};
use windows::{
    core::w,
    Win32::{
        Foundation::{HGLOBAL, HWND, LPARAM, LRESULT, WPARAM},
        System::{
            DataExchange::{
                AddClipboardFormatListener, CloseClipboard, GetClipboardData,
                IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
            },
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
            TranslateMessage, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WM_CLIPBOARDUPDATE, WNDCLASSW,
            WS_OVERLAPPED,
        },
    },
};

const CF_DIB_FORMAT: u32 = 8;
const CF_DIB_V5_FORMAT: u32 = 17;
const MAX_CLIPBOARD_BYTES: usize = 128 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 40_000_000;

static CLIPBOARD_APP: OnceLock<AppHandle> = OnceLock::new();

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if message == WM_CLIPBOARDUPDATE {
        if let Some(app) = CLIPBOARD_APP.get() {
            let _ = app.emit("clipboard-image-changed", ());
        }
        return LRESULT(0);
    }

    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

pub fn start_listener(app: AppHandle) {
    thread::spawn(move || {
        let _ = CLIPBOARD_APP.set(app);

        unsafe {
            let class_name = w!("SafeShareClipboardListener");
            let window_class = WNDCLASSW {
                lpfnWndProc: Some(window_proc),
                lpszClassName: class_name,
                ..Default::default()
            };

            if RegisterClassW(&window_class) == 0 {
                return;
            }

            let Ok(hwnd) = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                class_name,
                w!("SafeShare Clipboard Listener"),
                WS_OVERLAPPED,
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                None,
                None,
            ) else {
                return;
            };

            if AddClipboardFormatListener(hwnd).is_err() {
                return;
            }

            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
    });
}

struct ClipboardGuard;

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

pub fn read_png() -> Result<Option<Vec<u8>>, ()> {
    unsafe {
        OpenClipboard(None).map_err(|_| ())?;
        let _clipboard_guard = ClipboardGuard;

        let png_format = RegisterClipboardFormatW(w!("PNG"));
        if png_format != 0 && IsClipboardFormatAvailable(png_format).is_ok() {
            return copy_global_bytes(png_format).map(Some);
        }

        let dib_format = if IsClipboardFormatAvailable(CF_DIB_V5_FORMAT).is_ok() {
            CF_DIB_V5_FORMAT
        } else if IsClipboardFormatAvailable(CF_DIB_FORMAT).is_ok() {
            CF_DIB_FORMAT
        } else {
            return Ok(None);
        };

        let dib = copy_global_bytes(dib_format)?;
        dib_to_png(&dib).map(Some)
    }
}

unsafe fn copy_global_bytes(format: u32) -> Result<Vec<u8>, ()> {
    let handle = unsafe { GetClipboardData(format) }.map_err(|_| ())?;
    let global = HGLOBAL(handle.0);
    let size = unsafe { GlobalSize(global) };

    if size == 0 || size > MAX_CLIPBOARD_BYTES {
        return Err(());
    }

    let pointer = unsafe { GlobalLock(global) };
    if pointer.is_null() {
        return Err(());
    }

    let mut bytes = vec![0_u8; size];
    unsafe {
        copy_nonoverlapping(pointer.cast::<u8>(), bytes.as_mut_ptr(), size);
        let _ = GlobalUnlock(global);
    }
    Ok(bytes)
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, ()> {
    let value = bytes.get(offset..offset + 2).ok_or(())?;
    Ok(u16::from_le_bytes(value.try_into().map_err(|_| ())?))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, ()> {
    let value = bytes.get(offset..offset + 4).ok_or(())?;
    Ok(u32::from_le_bytes(value.try_into().map_err(|_| ())?))
}

fn read_i32(bytes: &[u8], offset: usize) -> Result<i32, ()> {
    let value = bytes.get(offset..offset + 4).ok_or(())?;
    Ok(i32::from_le_bytes(value.try_into().map_err(|_| ())?))
}

fn dib_to_png(dib: &[u8]) -> Result<Vec<u8>, ()> {
    if dib.len() < 40 {
        return Err(());
    }

    let header_size = read_u32(dib, 0)? as usize;
    let signed_width = read_i32(dib, 4)?;
    let signed_height = read_i32(dib, 8)?;
    let bit_count = read_u16(dib, 14)?;
    let compression = read_u32(dib, 16)?;

    if header_size < 40
        || header_size > dib.len()
        || signed_width <= 0
        || signed_height == 0
        || !matches!(bit_count, 24 | 32)
        || compression > 3
    {
        return Err(());
    }

    let width = signed_width as u32;
    let height = signed_height.unsigned_abs();
    let pixel_count = u64::from(width).checked_mul(u64::from(height)).ok_or(())?;
    if pixel_count > MAX_IMAGE_PIXELS {
        return Err(());
    }

    let bits_per_row = (width as usize).checked_mul(bit_count as usize).ok_or(())?;
    let stride = bits_per_row
        .checked_add(31)
        .ok_or(())?
        .checked_div(32)
        .ok_or(())?
        .checked_mul(4)
        .ok_or(())?;
    let mask_bytes = if header_size == 40 && compression == 3 {
        12
    } else {
        0
    };
    let pixel_offset = header_size.checked_add(mask_bytes).ok_or(())?;
    let pixel_bytes = stride.checked_mul(height as usize).ok_or(())?;
    let pixel_end = pixel_offset.checked_add(pixel_bytes).ok_or(())?;
    if pixel_end > dib.len() {
        return Err(());
    }

    let rgba_len = (pixel_count as usize).checked_mul(4).ok_or(())?;
    let mut rgba = vec![0_u8; rgba_len];
    let bytes_per_pixel = bit_count as usize / 8;

    for output_y in 0..height as usize {
        let source_y = if signed_height > 0 {
            height as usize - 1 - output_y
        } else {
            output_y
        };
        let row_start = pixel_offset + source_y * stride;
        let row = &dib[row_start..row_start + stride];

        for x in 0..width as usize {
            let source = x * bytes_per_pixel;
            let target = (output_y * width as usize + x) * 4;
            rgba[target] = row[source + 2];
            rgba[target + 1] = row[source + 1];
            rgba[target + 2] = row[source];
            rgba[target + 3] = if bit_count == 32 && row[source + 3] != 0 {
                row[source + 3]
            } else {
                255
            };
        }
    }

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&rgba, width, height, ColorType::Rgba8.into())
        .map_err(|_| ())?;
    rgba.fill(0);
    Ok(png)
}
