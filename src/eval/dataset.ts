import { verhoeffCheckDigit } from '../detection/verhoeff';

export type EvaluationType='Aadhaar'|'PAN'|'UPI ID'|'Phone'|'Email'|'API Token';
export type EvaluationLine={text:string;type:EvaluationType|null};

const positives:EvaluationLine[]=[
  ...Array.from({length:10},(_,index)=>{
    const prefix=String(23456789010+index);
    return{text:`Aadhaar: ${prefix}${verhoeffCheckDigit(prefix)}`,type:'Aadhaar' as const};
  }),
  ...Array.from({length:10},(_,index)=>({text:`PAN: ABCAD${String(index).padStart(4,'0')}${String.fromCharCode(65+index)}`,type:'PAN' as const})),
  ...Array.from({length:10},(_,index)=>({text:`UPI: testuser${index}@sbi`,type:'UPI ID' as const})),
  ...Array.from({length:10},(_,index)=>({text:`Phone: +91 98765 ${String(index).padStart(5,'0')}`,type:'Phone' as const})),
  ...Array.from({length:10},(_,index)=>({text:`Contact: test.user${index}@example.test`,type:'Email' as const})),
  ...Array.from({length:10},(_,index)=>({text:`ghp_${String(index).padStart(36,'A')}`,type:'API Token' as const}))
];
const invalidAadhaar=Array.from({length:10},(_,index)=>{
  const prefix=String(34567890120+index),check=verhoeffCheckDigit(prefix);
  return{text:`Reference ${prefix}${check==='0'?'1':'0'}`,type:null};
});
const negatives:EvaluationLine[]=[
  ...invalidAadhaar,
  ...Array.from({length:5},(_,index)=>({text:`Order ID ORD-2026-${String(700000+index)}`,type:null})),
  ...Array.from({length:5},(_,index)=>({text:`Recorded at 2026-11-${String(index+10).padStart(2,'0')}T13:28:54Z`,type:null})),
  ...Array.from({length:5},(_,index)=>({text:`Delivery PIN ${String(560001+index)}`,type:null})),
  ...Array.from({length:5},(_,index)=>({text:`UUID 550e8400-e29b-41d4-a716-${String(446655440000+index)}`,type:null})),
  ...Array.from({length:5},(_,index)=>({text:`Git revision ${String(index+1).padStart(40,'a')}`,type:null})),
  ...Array.from({length:5},(_,index)=>({text:`Plain prose sample number ${index+1} describes an ordinary meeting.`,type:null}))
];

export const evaluationDataset:EvaluationLine[]=[...positives,...negatives];
