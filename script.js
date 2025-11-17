:root{
  --bg-1:#071426;
  --bg-2:#0b3b5a;
  --card:rgba(255,255,255,0.02);
  --glass:rgba(255,255,255,0.04);
  --accent:#06b6d4;
  --muted:#9fb3c8;
  --white:#e6f7ff;
  --container:1100px;
  font-family:Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
}

/* full-screen soft textured background */
.bg{
  position:fixed; inset:0;
  background:
    radial-gradient(ellipse at 10% 20%, rgba(6,182,212,0.06) 0%, transparent 15%),
    radial-gradient(ellipse at 90% 80%, rgba(11,59,90,0.08) 0%, transparent 20%),
    linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%);
  filter: blur(0.4px);
  z-index:-2;
}
body{margin:0;color:var(--white);min-height:100vh; -webkit-font-smoothing:antialiased;}
.container{max-width:var(--container);margin:0 auto;padding:20px}

/* header */
.top{position:sticky;top:0;backdrop-filter: blur(6px); background: linear-gradient(180deg, rgba(3,7,13,0.35), rgba(3,7,13,0.15));border-bottom:1px solid rgba(255,255,255,0.03)}
.top-inner{display:flex;align-items:center;justify-content:space-between}
.brand{font-weight:800;color:var(--white);text-decoration:none;font-size:1.25rem}
nav button{margin-left:8px;padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:var(--white);cursor:pointer}
nav button:hover{background:rgba(255,255,255,0.02)}

/* panels */
.panel{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:18px;border-radius:12px;margin-top:18px;border:1px solid rgba(255,255,255,0.03);box-shadow:0 6px 30px rgba(2,6,23,0.45)}
.hero-panel{text-align:center;padding:36px}
.hero-panel h1{font-size:clamp(1.5rem,3.2vw,2.25rem);margin:0 0 8px}
.hero-panel p{color:var(--muted);max-width:720px;margin:8px auto}
.hero-actions{display:flex;gap:12px;justify-content:center;margin-top:12px}
.cta{background:var(--accent);color:#002; padding:12px 18px;border-radius:10px;border:0;cursor:pointer;font-weight:700}
.cta.ghost{background:transparent;border:1px solid rgba(255,255,255,0.06);color:var(--white)}

label{display:block;margin:10px 0;color:var(--muted)}
input,select,textarea{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,0.04);background:transparent;color:var(--white)}
.btn{background:var(--accent);color:#012;padding:10px 12px;border-radius:8px;border:0;cursor:pointer}
.btn.ghost{background:transparent;border:1px solid rgba(255,255,255,0.05)}
.hint{font-size:0.9rem;color:var(--muted)}
.muted{color:var(--muted);margin-top:8px}

/* grid */
.grid.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
.card{background:var(--glass);padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.02)}

/* tree */
.tree{padding:12px;border-radius:8px;min-height:120px;background:linear-gradient(180deg, rgba(255,255,255,0.01), transparent);border:1px dashed rgba(255,255,255,0.03)}
.node{display:inline-block;background:rgba(255,255,255,0.02);padding:10px;border-radius:8px;margin:8px;width:200px}
.node .id{font-size:0.8rem;color:var(--muted)}
.node .name{font-weight:700;margin-top:6px}
.controls{margin-top:12px}
.danger{background:rgba(255,20,20,0.08);border:1px solid rgba(255,20,20,0.18);color:#ffdfe0}

/* table */
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{padding:10px;border-bottom:1px solid rgba(255,255,255,0.02);text-align:left;color:var(--muted);font-size:0.95rem}

/* modal small */
.modalSmall{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,0.5)}
.modalInner{background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01));padding:16px;border-radius:10px;width:min(520px,96%);border:1px solid rgba(255,255,255,0.03)}

/* responsive */
@media (max-width:800px){
  .grid.two{grid-template-columns:1fr}
  nav button{padding:8px 10px;font-size:0.9rem}
}
// -------------------------------------------
//  PAY & ACTIVATE  (JazzCash / Easypaisa DEMO)
// -------------------------------------------

// helper: create payment request
async function createPayment(gateway, amount, memberId) {
  const res = await fetch('/.netlify/functions/create-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gateway, amount, memberId })
  });
  return res.json();
}

// jab "Pay 300 PKR & Activate" button pe click ho
document.addEventListener('DOMContentLoaded', () => {
  const payBtn = document.querySelector('#payActivate');
  if (!payBtn) return; // agar button missing hai

  payBtn.addEventListener('click', async () => {
    const form = document.querySelector('#loginForm');
    const fd = new FormData(form);
    const user = fd.get('user').trim();
    const password = fd.get('password');
    const msg = document.querySelector('#loginMsg');

    // local demo members load karna
    let members = [];
    try {
      members = typeof load === 'function' ? load() : JSON.parse(localStorage.getItem('binary_network_members_v1')) || [];
    } catch (e) {
      msg.textContent = 'Could not load members.';
      return;
    }

    const m = members.find(
      x => (x.email === user.toLowerCase() || x.id === user) && x.password === password
    );

    if (!m) {
      msg.textContent = 'Credentials do not match any account.';
      return;
    }

    // gateway choice
    const gateway = prompt('Choose payment method: jazzcash or easypaisa', 'jazzcash');
    if (!gateway) {
      msg.textContent = 'Payment cancelled.';
      return;
    }

    // call Netlify Function
    msg.textContent = 'Processing payment...';
    const result = await createPayment(gateway, 300, m.id);
    if (!result || !result.ok) {
      msg.textContent =
        'Payment init failed: ' +
        (result && result.error ? result.error : 'unknown');
      return;
    }

    // demo message
    msg.textContent = `Payment order created (id ${result.orderId}). 
In real integration redirect to gateway or open payment widget.`;

    // Real use-case:
    // window.location.href = result.paymentUrl;
  });
});
// -------------------------------------------
//  WITHDRAWAL REQUEST  (JazzCash / Easypaisa DEMO)
// -------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  const withdrawForm = document.querySelector('#withdrawForm');
  if (!withdrawForm) return; // agar form nahi mila to skip

  withdrawForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = typeof currentMember === 'function' ? currentMember() : null;
    if (!cur) {
      alert('Login required to send withdrawal request.');
      return;
    }

    const fd = new FormData(e.target);
    const amount = fd.get('amount');
    const accountType = fd.get('accountType');
    const accountDetails = fd.get('accountDetails');
    const msgEl = document.querySelector('#withdrawMsg');
    msgEl.textContent = 'Processing withdrawal request...';

    try {
      const res = await fetch('/.netlify/functions/withdraw-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: cur.id,
          amount,
          accountType,
          accountDetails
        })
      });

      const data = await res.json();
      msgEl.textContent = data.message || 'Withdrawal request sent (demo).';
      e.target.reset();
    } catch (err) {
      msgEl.textContent = 'Error sending withdrawal request.';
      console.error(err);
    }
  });
});

