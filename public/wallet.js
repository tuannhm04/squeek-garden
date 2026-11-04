// Browser side of wallet sign-in: a signed text message, no gas and no transaction.

/** Calls the game server. Passing a body makes it a POST. Throws an Error with a readable message. */
export async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('The game server is not available here.');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'The game server refused that.');
  return data;
}

const toHex = text => `0x${[...new TextEncoder().encode(text)].map(b => b.toString(16).padStart(2, '0')).join('')}`;

/** Asks the wallet for a signature and opens a session. Returns the signed-in address. */
export async function connectWallet() {
  const eth = window.ethereum;
  if (!eth) throw new Error('No wallet found. Install a browser wallet such as MetaMask or Rabby.');
  const [account] = await eth.request({ method: 'eth_requestAccounts' });
  if (!account) throw new Error('The wallet did not share an account.');
  const chainId = parseInt(await eth.request({ method: 'eth_chainId' }), 16);
  const { nonce, address } = await api(`/api/nonce?address=${encodeURIComponent(account)}`);
  const issued = new Date();
  const message = [
    `${location.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Squeek Garden. This costs no gas and sends no transaction.',
    '',
    `URI: ${location.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issued.toISOString()}`,
    `Expiration Time: ${new Date(issued.getTime() + 600000).toISOString()}`,
  ].join('\n');
  const signature = await eth.request({ method: 'personal_sign', params: [toHex(message), account] });
  return (await api('/api/login', { message, signature })).address;
}
