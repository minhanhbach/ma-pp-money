
const API_URL = "https://script.google.com/macros/s/AKfycbwPMh7Xmd-yXTsTF_U0CU9CTWx3L19nlLPWKTST3I6oWQbMwt3H1FwthpQ4J4Ujir7x/exec";

const state = {
  transactions: [],
  categories: [],
  accounts: [],
  recurring: [],
  selectedDate: new Date(),
  txType: "Expense"
};

const money = n => new Intl.NumberFormat("vi-VN", {
  style: "currency", currency: "VND", maximumFractionDigits: 0
}).format(Number(n || 0));

const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
}[m]));

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function sameMonth(dateValue, refDate) {
  const d = toDate(dateValue);
  return d && d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
}

async function getAction(action) {
  const res = await fetch(`${API_URL}?action=${encodeURIComponent(action)}`);
  if (!res.ok) throw new Error("Không đọc được dữ liệu");
  return res.json();
}

async function postData(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Không lưu được dữ liệu");
  return res.json();
}

async function loadAll() {
  try {
    const [transactions, categories, accounts, recurring] = await Promise.all([
      getAction("transactions"),
      getAction("categories"),
      getAction("accounts"),
      getAction("recurring")
    ]);
    state.transactions = Array.isArray(transactions) ? transactions : [];
    state.categories = Array.isArray(categories) ? categories.filter(x => x.Active !== "No") : [];
    state.accounts = Array.isArray(accounts) ? accounts.filter(x => x.Active !== "No") : [];
    state.recurring = Array.isArray(recurring) ? recurring.filter(x => x.Active !== "No") : [];
    hydrateSelects();
    renderAll();
  } catch (err) {
    console.error(err);
    document.getElementById("recentTransactions").innerHTML = `<div class="empty">Không tải được dữ liệu. Kiểm tra Apps Script API.</div>`;
  }
}

function hydrateSelects() {
  const catOptions = state.categories
    .map(c => `<option value="${esc(c.Category)}">${esc(c.Icon || "")} ${esc(c.Category)}</option>`).join("");
  document.getElementById("category").innerHTML = catOptions;
  document.getElementById("filterCategory").innerHTML =
    `<option value="">Tất cả nhóm</option>` + catOptions;

  const accountOptions = state.accounts
    .map(a => `<option value="${esc(a["Account Name"])}">${esc(a["Account Name"])}</option>`).join("");
  document.getElementById("account").innerHTML = accountOptions;
}

function getMonthTransactions() {
  return state.transactions.filter(t =>
    sameMonth(t.Date, state.selectedDate) &&
    t.Status !== "Ignored" &&
    t.Status !== "Duplicate"
  );
}

function renderDashboard() {
  const txs = getMonthTransactions();
  let income = 0, expense = 0;
  const cats = {};

  txs.forEach(t => {
    const amount = Number(t.Amount || 0);
    if (t.Type === "Income") income += amount;
    if (t.Type === "Expense") {
      expense += amount;
      const cat = t.Category || "Other Expense";
      cats[cat] = (cats[cat] || 0) + amount;
    }
  });

  const remaining = income - expense;
  const saving = income > 0 ? (remaining / income * 100) : 0;

  document.getElementById("incomeKpi").textContent = money(income);
  document.getElementById("expenseKpi").textContent = money(expense);
  document.getElementById("remainingKpi").textContent = money(remaining);
  document.getElementById("savingKpi").textContent = `${saving.toFixed(1)}%`;
  document.getElementById("monthLabel").textContent =
    new Intl.DateTimeFormat("vi-VN", { month:"long", year:"numeric" }).format(state.selectedDate);

  const sortedCats = Object.entries(cats).sort((a,b) => b[1]-a[1]);
  const max = sortedCats[0]?.[1] || 1;
  document.getElementById("categoryTotal").textContent = expense ? money(expense) : "";

  document.getElementById("categoryBars").innerHTML = sortedCats.length
    ? sortedCats.map(([name,value]) => `
      <div class="bar-row">
        <div>${esc(name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, value/max*100)}%"></div></div>
        <div>${money(value)}</div>
      </div>`).join("")
    : `<div class="empty">Chưa có chi tiêu trong tháng này.</div>`;

  const recent = [...txs].sort((a,b)=>new Date(b.Date)-new Date(a.Date)).slice(0,5);
  document.getElementById("recentTransactions").innerHTML = renderTxItems(recent);
}

function renderTxItems(txs) {
  if (!txs.length) return `<div class="empty">Chưa có giao dịch.</div>`;
  return txs.map(t => {
    const d = toDate(t.Date);
    const ds = d ? new Intl.DateTimeFormat("vi-VN", {day:"2-digit",month:"2-digit"}).format(d) : "";
    const isIncome = t.Type === "Income";
    return `<div class="tx-item">
      <div>
        <div class="tx-title">${esc(t.Description || t.Merchant || t.Category || "Giao dịch")}</div>
        <div class="tx-meta">${ds} · ${esc(t.Category || "")} · ${esc(t.Account || "")} · ${esc(t.Owner || "")}</div>
      </div>
      <div class="amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "-"}${money(t.Amount)}</div>
    </div>`;
  }).join("");
}

function renderTransactions() {
  const type = document.getElementById("filterType").value;
  const owner = document.getElementById("filterOwner").value;
  const category = document.getElementById("filterCategory").value;

  let txs = getMonthTransactions().filter(t =>
    (!type || t.Type === type) &&
    (!owner || t.Owner === owner) &&
    (!category || t.Category === category)
  );
  txs.sort((a,b)=>new Date(b.Date)-new Date(a.Date));
  document.getElementById("transactionsList").innerHTML = renderTxItems(txs);
}

function renderRecurring() {
  const el = document.getElementById("recurringList");
  el.innerHTML = state.recurring.length ? state.recurring.map(r => `
    <div class="list-row">
      <div>
        <div class="list-title">${esc(r.Name)}</div>
        <div class="list-sub">${esc(r.Type)} · Ngày ${esc(r.Day_of_Month || "")} · ${esc(r.Amount_Mode || "")}</div>
      </div>
      <strong>${r.Amount ? money(r.Amount) : "Chưa nhập"}</strong>
    </div>
  `).join("") : `<div class="empty">Chưa có khoản định kỳ.</div>`;
}

function renderSettings() {
  document.getElementById("accountsList").innerHTML = state.accounts.map(a => `
    <div class="list-row">
      <div>
        <div class="list-title">${esc(a["Account Name"])}</div>
        <div class="list-sub">${esc(a.Owner)} · ${esc(a["Account Type"])} · ${esc(a["Auto Method"])}</div>
      </div>
    </div>`).join("");

  document.getElementById("categoriesList").innerHTML = state.categories.map(c =>
    `<span class="chip">${esc(c.Icon || "")} ${esc(c.Category)}</span>`
  ).join("");
}

function renderAll() {
  renderDashboard();
  renderTransactions();
  renderRecurring();
  renderSettings();
}

function navigate(view) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  window.scrollTo({top:0,behavior:"smooth"});
}

document.querySelectorAll(".nav-btn").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.view)));
document.querySelectorAll("[data-nav]").forEach(btn => btn.addEventListener("click", () => navigate(btn.dataset.nav)));

document.getElementById("prevMonth").addEventListener("click", () => {
  state.selectedDate = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth()-1, 1);
  renderAll();
});
document.getElementById("nextMonth").addEventListener("click", () => {
  state.selectedDate = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth()+1, 1);
  renderAll();
});
document.getElementById("refreshBtn").addEventListener("click", loadAll);
["filterType","filterOwner","filterCategory"].forEach(id =>
  document.getElementById(id).addEventListener("change", renderTransactions)
);

document.querySelectorAll(".seg").forEach(btn => btn.addEventListener("click", () => {
  state.txType = btn.dataset.type;
  document.querySelectorAll(".seg").forEach(x => x.classList.remove("active"));
  btn.classList.add("active");
}));

document.querySelectorAll(".quick-amounts button").forEach(btn => btn.addEventListener("click", () => {
  document.getElementById("amount").value = btn.dataset.amount;
}));

document.getElementById("date").value = new Date().toISOString().slice(0,10);

document.getElementById("transactionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveBtn");
  const msg = document.getElementById("formMessage");
  saveBtn.disabled = true;
  saveBtn.textContent = "Đang lưu...";
  msg.textContent = "";

  const payload = {
    action: "addTransaction",
    transaction: {
      Date: document.getElementById("date").value,
      Type: state.txType,
      Amount: Number(document.getElementById("amount").value || 0),
      Description: document.getElementById("description").value.trim(),
      Merchant: "",
      Category: document.getElementById("category").value,
      Account: document.getElementById("account").value,
      Owner: document.getElementById("owner").value,
      "Fixed/Variable": document.getElementById("fixedVariable").value,
      Source: "Manual",
      Status: "Confirmed",
      Note: document.getElementById("note").value.trim()
    }
  };

  try {
    const result = await postData(payload);
    if (result.success === false) throw new Error(result.error || "Lỗi lưu");
    msg.textContent = "Đã lưu giao dịch ✓";
    document.getElementById("amount").value = "";
    document.getElementById("description").value = "";
    document.getElementById("note").value = "";
    await loadAll();
    setTimeout(() => navigate("home"), 500);
  } catch (err) {
    console.error(err);
    msg.textContent = "Không lưu được. Nếu trình duyệt báo CORS, mình sẽ chuyển sang phương án proxy an toàn.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lưu giao dịch";
  }
});

loadAll();
