// @vitest-environment jsdom
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { signupRedirect } from '../auth/AuthForm';

const token='f'.repeat(64);
describe('safe signup confirmation redirects',()=>{
 beforeEach(()=>{localStorage.clear();sessionStorage.clear();vi.restoreAllMocks()});
 it('uses the application origin for generic signup',()=>{expect(signupRedirect(undefined,'https://safe.example')).toBe('https://safe.example')});
 it('returns invitation signup to the validated route on the same origin',()=>{expect(signupRedirect(token,'https://safe.example')).toBe('https://safe.example/invite/'+token)});
 it('cannot inject an external destination through invalid invitation input',()=>{const malicious='https://evil.example/invite/'+token;expect(signupRedirect(malicious,'https://safe.example')).toBe('https://safe.example');expect(signupRedirect('../evil','https://safe.example')).toBe('https://safe.example')});
 it('does not persist invitation tokens in browser storage',()=>{const local=vi.spyOn(Storage.prototype,'setItem');signupRedirect(token,'https://safe.example');expect(local).not.toHaveBeenCalled();expect(JSON.stringify({...localStorage,...sessionStorage})).not.toContain(token)});
});