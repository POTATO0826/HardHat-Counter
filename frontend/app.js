// Your Sepolia deployment. Update this address if you deploy Counter elsewhere.
const CONTRACT = "0x7340659510ac9d0A8B37fC96129766a9cCAA7658";
const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
const CHAIN_ID = "0xaa36a7"; //  Sepolia: 11155111 in hexadecimal
// First four bytes of keccak256("x()") and keccak256("inc()").
const SELECTOR = { x: "0x0c55699c", inc: "0x371303c0" };
const $ = (id) => document.getElementById(id);
const shortAddress = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;
let provider;
let account;
let walletChain;
let ready = false;
let busy = false;
let refreshing = false;
let requestId = 0;
let walletRevision = 0;

$("contract-address").textContent = shortAddress(CONTRACT);
$("contract-address").title = CONTRACT;

// Reads go directly to Sepolia. Only MetaMask can approve a transaction.
async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok)
    throw new Error(
      "Sepolia RPC is not responding. Try refreshing in a moment.",
    );
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}

function status(title, detail, kind = "", hash = "") {
  $("transaction-title").textContent = title;
  $("transaction-detail").textContent = detail;
  $("activity-content").className = `activity-content ${kind}`;
  $("transaction-hash").hidden = !hash;
  $("transaction-hash").textContent = hash ? `Transaction: ${hash}` : "";
}

function errorMessage(error) {
  if (error.code === 4001)
    return "Request cancelled in MetaMask. You can try again whenever you are ready.";
  if (error.code === -32002)
    return "A request is already waiting. Open MetaMask to review it.";
  if (/insufficient funds/i.test(error.message))
    return "This wallet needs Sepolia test ETH to pay the transaction fee.";
  if (/fetch|timeout|networkerror/i.test(error.message))
    return "Cannot reach Sepolia. Check your internet connection and try again.";
  return error.message || "Something went wrong. Please try again.";
}

function renderWallet() {
  const correctChain = walletChain === CHAIN_ID;
  $("connect").textContent = busy
    ? "Please wait…"
    : !account
      ? "Connect MetaMask ↗"
      : !correctChain
        ? "Switch to Sepolia ↗"
        : "Wallet connected ✓";
  $("connect").disabled = busy || Boolean(account && correctChain);
  $("increment").disabled = busy || !ready || !account || !correctChain;
  $("wallet-state").textContent = account
    ? shortAddress(account)
    : "Not connected";
  $("wallet-state").title = account || "";
  $("wallet-network").textContent = !account
    ? "—"
    : correctChain
      ? "Sepolia"
      : "Different network";
  $("wallet-hint").textContent = !account
    ? "Connect MetaMask to start counting."
    : correctChain
      ? "Ready for your next transaction."
      : "Switch to Sepolia to use this counter.";
  if (!account || !correctChain) $("balance").textContent = "— ETH";
}

async function syncWallet() {
  if (!provider) return;
  const revision = ++walletRevision;
  const [accounts, chain] = await Promise.all([
    provider.request({ method: "eth_accounts" }),
    provider.request({ method: "eth_chainId" }),
  ]);
  if (revision !== walletRevision) return;
  account = accounts[0];
  walletChain = chain.toLowerCase();
  renderWallet();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  $("refresh").disabled = true;
  try {
    const [chain, code] = await Promise.all([
      rpc("eth_chainId"),
      rpc("eth_getCode", [CONTRACT, "latest"]),
    ]);
    if (chain !== CHAIN_ID)
      throw new Error("The RPC endpoint is not on Sepolia (chain 11155111).");
    if (!code || code === "0x")
      throw new Error(
        "No contract found at this Sepolia address. Check your deployment address.",
      );
    const raw = await rpc("eth_call", [
      { to: CONTRACT, data: SELECTOR.x },
      "latest",
    ]);
    if (!/^0x[0-9a-fA-F]{64}$/.test(raw))
      throw new Error(
        "This address did not return a Counter value. Check your deployment.",
      );
    const value = BigInt(raw).toString();
    $("count").textContent = value;
    $("count").classList.toggle("long-value", value.length > 8);
    $("count-note").textContent = "Read directly from your contract";
    $("node-status").textContent = "Node online";
    $("node-status").className = "badge live";
    ready = true;
    if (account && walletChain === CHAIN_ID) {
      const currentAccount = account;
      const wei = BigInt(
        await rpc("eth_getBalance", [currentAccount, "latest"]),
      );
      const whole = wei / 10n ** 18n;
      const fraction = (wei % 10n ** 18n)
        .toString()
        .padStart(18, "0")
        .slice(0, 4)
        .replace(/0+$/, "");
      if (account === currentAccount && walletChain === CHAIN_ID)
        $("balance").textContent =
          `${whole}${fraction ? `.${fraction}` : ""} ETH`;
    }
  } catch (error) {
    ready = false;
    $("count").textContent = "—";
    $("count-note").textContent = errorMessage(error);
    $("node-status").textContent = "Check connection";
    $("node-status").className = "badge error";
  } finally {
    refreshing = false;
    $("refresh").disabled = false;
    renderWallet();
  }
}

function useProvider(candidate) {
  if (provider || !candidate) return;
  provider = candidate;
  provider.on?.("accountsChanged", () =>
    syncWallet()
      .then(refresh)
      .catch((error) =>
        status("Wallet disconnected", errorMessage(error), "error"),
      ),
  );
  provider.on?.("chainChanged", () => {
    walletChain = undefined;
    renderWallet();
    syncWallet()
      .then(refresh)
      .catch((error) =>
        status("Network unavailable", errorMessage(error), "error"),
      );
  });
  provider.on?.("disconnect", () => {
    ++walletRevision;
    account = undefined;
    walletChain = undefined;
    renderWallet();
  });
  syncWallet()
    .then(refresh)
    .catch(() => renderWallet());
}

// EIP-6963 selects MetaMask even when several wallet extensions are installed.
window.addEventListener("eip6963:announceProvider", (event) => {
  if (event.detail?.info?.rdns === "io.metamask")
    useProvider(event.detail.provider);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
setTimeout(() => {
  const injected = window.ethereum;
  useProvider(
    injected?.providers?.find((item) => item.isMetaMask) ||
      (injected?.isMetaMask ? injected : undefined),
  );
}, 300);

async function connect() {
  if (busy) return;
  if (!provider) {
    status(
      "MetaMask not found",
      "Open this page in the browser where your MetaMask extension is installed.",
      "error",
    );
    return;
  }
  busy = true;
  renderWallet();
  try {
    await provider.request({ method: "eth_requestAccounts" });
    if (
      (await provider.request({ method: "eth_chainId" })).toLowerCase() !==
      CHAIN_ID
    ) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID }],
        });
      } catch (error) {
        if (error.code !== 4902 && error.data?.originalError?.code !== 4902)
          throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID,
              chainName: "Sepolia",
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            },
          ],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID }],
        });
      }
    }
    await syncWallet();
    if (!account || walletChain !== CHAIN_ID)
      throw new Error("Select your account on Sepolia in MetaMask.");
    await refresh();
    status(
      "Wallet connected.",
      "Click Increment counter when you are ready. MetaMask will ask you to approve.",
      "success",
    );
  } catch (error) {
    status("Connection not completed", errorMessage(error), "error");
  } finally {
    busy = false;
    renderWallet();
  }
}

async function increment() {
  if (busy || !ready || !account || walletChain !== CHAIN_ID) return;
  busy = true;
  renderWallet();
  let hash;
  try {
    const from = account;
    const chain = await provider.request({ method: "eth_chainId" });
    const accounts = await provider.request({ method: "eth_accounts" });
    if (
      chain.toLowerCase() !== CHAIN_ID ||
      accounts[0]?.toLowerCase() !== from.toLowerCase()
    )
      throw new Error(
        "Your wallet changed. Reconnect to Sepolia and try again.",
      );
    status(
      "Approve in MetaMask",
      "Review the transaction to increase your counter by 1.",
    );
    hash = await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: CONTRACT,
          data: SELECTOR.inc,
          value: "0x0",
          chainId: CHAIN_ID,
        },
      ],
    });
    status(
      "Transaction submitted",
      "Waiting for Sepolia to confirm it…",
      "",
      hash,
    );
    const deadline = Date.now() + 120000;
    let receipt;
    while (Date.now() < deadline) {
      receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!receipt) {
      status(
        "Still awaiting confirmation",
        "Your transaction was submitted. Refresh the value later; avoid submitting it twice.",
        "",
        hash,
      );
      return;
    }
    if (BigInt(receipt.status) !== 1n)
      throw new Error(
        "The transaction reverted. The counter was not changed by this transaction.",
      );
    await refresh();
    status(
      "One step forward.",
      "Your increment was confirmed on Sepolia.",
      "success",
      hash,
    );
  } catch (error) {
    status(
      hash ? "Check transaction status" : "Transaction not completed",
      errorMessage(error),
      "error",
      hash,
    );
  } finally {
    busy = false;
    renderWallet();
  }
}

$("connect").addEventListener("click", connect);
$("increment").addEventListener("click", increment);
$("refresh").addEventListener("click", refresh);
$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(CONTRACT);
    $("copy").textContent = "Copied!";
    setTimeout(() => {
      $("copy").textContent = "Copy";
    }, 2000);
  } catch {
    status("Contract address", CONTRACT);
  }
});
renderWallet();
refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 5000);

// Optional browser integration: read the same value shown on the page.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "read_counter",
          description:
            "Refresh and read the Sepolia Counter value. Does not send a transaction.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input) => {
            if (
              !input ||
              typeof input !== "object" ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error("Expected an empty object.");
            const value = BigInt(
              await rpc("eth_call", [
                { to: CONTRACT, data: SELECTOR.x },
                "latest",
              ]),
            ).toString();
            await refresh();
            return { value, contract: CONTRACT, chainId: Number(CHAIN_ID) };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {
    /* The page works without experimental browser APIs. */
  }
}
