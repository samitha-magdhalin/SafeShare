export type Severity = 'CRITICAL' | 'SENSITIVE' | 'REVIEW' | 'INFO';
export type Box = { x: number; y: number; width: number; height: number };
export type Word = { text: string; confidence: number; box: Box; symbols?: Array<{text:string;box:Box}> };
export type Finding = { id: string; type: string; category: 'secret'|'personal'|'network'|'qr'|'metadata'; severity: Severity; confidence: number; box?: Box; maskedPreview: string; source: 'ocr'|'qr'|'metadata'; description: string; selected: boolean; fingerprint?: string };
export type MetadataRisk = { type: string; description: string };
