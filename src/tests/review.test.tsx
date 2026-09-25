// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeforeAfterReview } from '../review/BeforeAfterReview';
import type { Finding } from '../types';

const secret:Finding={id:'secret',type:'API Key',category:'secret',severity:'CRITICAL',confidence:99,maskedPreview:'sk_••••••',source:'ocr',description:'credential',selected:true};

describe('before and after review',()=>{
  afterEach(()=>{document.body.textContent='';});
  it('shows exact original and protected URLs with a type-only change summary',async()=>{const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<BeforeAfterReview originalUrl="blob:original" protectedUrl="blob:verified" profileName="Client Sharing" protectedFindings={[secret,{...secret,id:'second'}]} verificationReady={true} warningCount={1} approved={false} onApprove={()=>{}}/>));const images=[...container.querySelectorAll('img')];expect(images.map(image=>image.src)).toEqual(['blob:original','blob:verified']);expect(container.textContent).toContain('API Key × 2');expect(container.textContent).not.toContain(secret.maskedPreview);expect(container.textContent).toContain('Passed — review recommended');expect(container.textContent).toContain('1 warning remains');await act(async()=>root.unmount());});
  it('does not allow approval before verification and invokes approval after verification',async()=>{const approve=vi.fn(),container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<BeforeAfterReview originalUrl="blob:original" protectedUrl="blob:verified" profileName="Client Sharing" protectedFindings={[secret]} verificationReady={false} warningCount={0} approved={false} onApprove={approve}/>));let button=container.querySelector('button')!;expect(button.disabled).toBe(true);await act(async()=>button.click());expect(approve).not.toHaveBeenCalled();await act(async()=>root.render(<BeforeAfterReview originalUrl="blob:original" protectedUrl="blob:verified" profileName="Client Sharing" protectedFindings={[secret]} verificationReady={true} warningCount={0} approved={false} onApprove={approve}/>));button=container.querySelector('button')!;expect(button.disabled).toBe(false);await act(async()=>button.click());expect(approve).toHaveBeenCalledOnce();await act(async()=>root.unmount());});
});
