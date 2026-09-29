import type { PolicyCacheRecord, PolicyCacheStore } from './types';
import type { NativeBridge } from '../native';

export class NativePolicyCache implements PolicyCacheStore{
  constructor(private readonly bridge:Pick<NativeBridge,'readPolicyCache'|'writePolicyCache'>){}
  async read():Promise<unknown|null>{
    const serialized=await this.bridge.readPolicyCache();
    if(!serialized)return null;
    try{return JSON.parse(serialized) as unknown;}catch{return null;}
  }
  async write(value:PolicyCacheRecord):Promise<void>{await this.bridge.writePolicyCache(JSON.stringify(value));}
}