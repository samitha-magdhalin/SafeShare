import {describe,it,expect} from 'vitest';
import {detectText} from '../detection/detect';
import {selectProtectable,verifyImage} from '../verification/verify';

describe('realistic credential contexts',()=>{
  const cases:[string,string][]=[
    ['API_KEY=sk_test_safeshare_8H2K9M4P7Q','API Key'],
    ['APIKEY: "fakeKey_123456"','API Key'],
    ['API_TOKEN=ghp_FAKE_SAFESHARE_TOKEN_123456','API Token'],
    ['ACCESS_TOKEN=tok_demo_72KLM91XYZ','Access Token'],
    ['AUTH_TOKEN = "fake_auth_123456"','Access Token'],
    ['TOKEN: fake_token_987654','Access Token'],
    ['SECRET=fake_secret_123456','Secret'],
    ['SECRET_KEY=fake_secret_key_123456','Secret'],
    ['PASSWORD=DemoPassword_987','Password'],
    ['PASSWD: FakeTerminalPass123','Password'],
    ['DATABASE_URL=postgresql://demo_user:FakePass123@192.168.1.44:5432/demo','Database Connection String'],
    ['AWS_ACCESS_KEY_ID=AKIAFAKESAFESHARE123','AWS Access Key'],
    ['AWS_SECRET_ACCESS_KEY=fakeSecret123456','AWS Secret Access Key'],
    ['Authorization: Bearer fake_token_987654','Bearer Token'],
    ['Bearer fake_token_987654','Bearer Token'],
  ];
  it.each(cases)('detects %s as %s',(text,type)=>{const finding=detectText(text).find(f=>f.type===type);expect(finding?.severity).toBe('CRITICAL');expect(finding?.selected).toBe(true);});
  it('classifies supported database schemes and embedded credentials',()=>{
    for(const scheme of ['postgresql','postgres','mysql','mongodb','mongodb+srv','redis']){
      expect(detectText(`${scheme}://demo:fakePass123@db.internal/demo`).some(f=>f.type==='Database Connection String'&&f.severity==='CRITICAL')).toBe(true);
    }
  });
  it('keeps public sites informational and off by default',()=>{
    const findings=detectText('PUBLIC_SITE=https://example.com');
    expect(findings).toHaveLength(1);expect(findings[0].type).toBe('Public URL');expect(findings[0].severity).toBe('INFO');expect(findings[0].selected).toBe(false);
    expect(selectProtectable(findings)[0].selected).toBe(false);
  });
  it('tolerates recoverable OCR spaces within a token assignment',()=>{
    const finding=detectText('API _ TOKEN = ghp_ FAKE_SAFESHARE_TOKEN_123456').find(f=>f.type==='API Token');
    expect(finding?.severity).toBe('CRITICAL');expect(finding?.box).toBeUndefined();
  });
  it('does not turn documentation or isolated words into credentials',()=>{
    for(const text of ['Set your password in Settings','token','secret','password','The token expires tomorrow','Keep your secret safe'])expect(detectText(text).filter(f=>f.severity==='CRITICAL')).toHaveLength(0);
  });
  it('blocks ready status for a newly found sensitive value after protection',()=>{
    const original=detectText('API_KEY=fakeKey_123456');
    const rescanned=detectText('customer.demo@example.com');
    const report=verifyImage(original,rescanned);
    expect(report.checks[0].passed).toBe(true);expect(report.unresolved).toHaveLength(1);expect(report.ready).toBe(false);
  });
  it('allows informational URLs after selected secrets are removed',()=>{
    const original=detectText('PASSWORD=fakePassword123');
    const report=verifyImage(original,detectText('https://example.com'));
    expect(report.ready).toBe(true);expect(report.reviewCount).toBe(1);
  });
});
