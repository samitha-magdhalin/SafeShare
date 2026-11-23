import {describe,expect,it} from 'vitest';
import {detectText} from '../detection/detect';
import {evaluationDataset, type EvaluationType} from './dataset';

const types:EvaluationType[]=['Aadhaar','PAN','UPI ID','Phone','Email','API Token'];

describe('synthetic detector evaluation',()=>{
  it('meets per-type precision and recall floors',()=>{
    const results=types.map(type=>{
      let truePositive=0,falsePositive=0,falseNegative=0;
      for(const line of evaluationDataset){
        const predicted=detectText(line.text).some(finding=>finding.type===type);
        if(line.type===type){if(predicted)truePositive++;else falseNegative++;}
        else if(predicted)falsePositive++;
      }
      const precision=truePositive+falsePositive?truePositive/(truePositive+falsePositive):0;
      const recall=truePositive/(truePositive+falseNegative);
      return{type,truePositive,falsePositive,falseNegative,precision:Number(precision.toFixed(3)),recall:Number(recall.toFixed(3))};
    });
    console.table(results);
    expect(evaluationDataset).toHaveLength(100);
    for(const result of results){
      expect(result.precision,`${result.type} precision`).toBeGreaterThanOrEqual(0.95);
      expect(result.recall,`${result.type} recall`).toBeGreaterThanOrEqual(0.90);
    }
  });
});
