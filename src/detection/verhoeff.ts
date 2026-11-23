const multiplication=[
  [0,1,2,3,4,5,6,7,8,9],
  [1,2,3,4,0,6,7,8,9,5],
  [2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],
  [4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],
  [7,6,5,9,8,2,1,0,4,3],
  [8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];
const permutation=[
  [0,1,2,3,4,5,6,7,8,9],
  [1,5,7,6,2,8,3,0,9,4],
  [5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],
  [7,0,4,6,9,1,3,2,5,8]
];
const inverse=[0,4,3,2,1,5,6,7,8,9];

export function verhoeffCheckDigit(digits:string):string{
  if(!/^\d+$/.test(digits))throw new Error('Verhoeff input must contain only digits.');
  let checksum=0;
  for(let index=0;index<digits.length;index++){
    const digit=Number(digits[digits.length-1-index]);
    checksum=multiplication[checksum][permutation[(index+1)%8][digit]];
  }
  return String(inverse[checksum]);
}
export function verhoeffValid(digits:string):boolean{
  if(!/^\d+$/.test(digits))return false;
  let checksum=0;
  for(let index=0;index<digits.length;index++){
    const digit=Number(digits[digits.length-1-index]);
    checksum=multiplication[checksum][permutation[index%8][digit]];
  }
  return checksum===0;
}
