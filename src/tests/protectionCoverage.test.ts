import {describe,expect,it} from 'vitest';
import type {Finding} from '../types';
import {planProtection,ProtectionCoverageError} from '../utils/image';
import {verifyImage} from '../verification/verify';

function credential(box?:Finding['box']):Finding{return{id:'api-key',type:'API Key',category:'secret',severity:'CRITICAL',confidence:95,maskedPreview:'s***',source:'ocr',description:'credential',selected:true,box}}

describe('required protection coverage',()=>{
  it('records explicit coverage for every selected finding',()=>{
    const planned=planProtection([credential({x:10,y:10,width:80,height:20})],200,100);
    expect(planned.coverage).toEqual({required:1,applied:1,complete:true,requiredFindingIds:['api-key'],appliedFindingIds:['api-key']});
    expect(planned.applications[0].rect).toEqual({x:8,y:8,width:84,height:24});
  });
  it('fails closed when required geometry is missing',()=>{
    expect(()=>planProtection([credential()],200,100)).toThrow(ProtectionCoverageError);
    try{planProtection([credential()],200,100)}catch(error){expect((error as ProtectionCoverageError).coverage).toEqual({required:1,applied:0,complete:false,requiredFindingIds:['api-key'],appliedFindingIds:[]})}
  });
  it.each([
    {x:Number.NaN,y:10,width:20,height:10},
    {x:Number.POSITIVE_INFINITY,y:10,width:20,height:10},
    {x:-1,y:10,width:20,height:10},
    {x:190,y:10,width:20,height:10},
    {x:10,y:95,width:20,height:10},
    {x:10,y:10,width:0,height:10},
  ])('fails closed for invalid or out-of-bounds geometry %#',(box)=>{
    expect(()=>planProtection([credential(box)],200,100)).toThrow(ProtectionCoverageError);
  });
  it('cannot become ready after partial protection even when fresh OCR misses the remainder',()=>{
    const original=[credential({x:10,y:10,width:40,height:20})];
    expect(verifyImage(original,[],undefined,{required:1,applied:0,complete:false,requiredFindingIds:['api-key'],appliedFindingIds:[]}).ready).toBe(false);
    expect(verifyImage(original,[]).ready).toBe(false);
  });
  it('requires both complete coverage and a clean fresh scan',()=>{
    const original=[credential({x:10,y:10,width:80,height:20})];
    const coverage={required:1,applied:1,complete:true,requiredFindingIds:['api-key'],appliedFindingIds:['api-key']};
    expect(verifyImage(original,[],undefined,coverage).ready).toBe(true);
    expect(verifyImage(original,[credential({x:10,y:10,width:20,height:20})],undefined,coverage).ready).toBe(false);
  });
});
