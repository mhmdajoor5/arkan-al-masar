import {env} from 'cloudflare:workers';

// MyFatoorah connection settings. The API token is a Worker secret (MYFATOORAH_TOKEN) and is never stored
// in the database or sent to the browser. Without a token, online payment stays switched off.
export const MYFATOORAH_TEST_URL='https://apitest.myfatoorah.com';
export const MYFATOORAH_SAUDI_URL='https://api-sa.myfatoorah.com';

export function gatewayConfig(){
  const vars=env as unknown as Record<string,unknown>;
  const token=String(vars.MYFATOORAH_TOKEN||'').trim();
  const requested=String(vars.MYFATOORAH_BASE_URL||MYFATOORAH_TEST_URL).trim().replace(/\/+$/,'');
  const base=[MYFATOORAH_TEST_URL,MYFATOORAH_SAUDI_URL].includes(requested)?requested:MYFATOORAH_TEST_URL;
  return {token,base,ready:token.length>=20,test:base===MYFATOORAH_TEST_URL};
}

export const gatewayReady=()=>gatewayConfig().ready;
