import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';

/**
 * Self-contained Practice Software Testing (Toolshop v5) + Payment Webhook Sandbox Server.
 * Mirrors the exact REST API and `data-test` UI contracts of testsmith-io/practice-software-testing
 * while adding fast state reset (`/api/test/reset`) and Stripe Webhook verification (`/api/webhooks/stripe`).
 */

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: { id: string; name: string };
  brand: { id: string; name: string };
  in_stock: boolean;
}

interface CartItem {
  product_id: string;
  quantity: number;
  product: Product;
}

interface WebhookEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
  };
  verified: boolean;
}

interface CommunityPost {
  id: string;
  author: string;
  title: string;
  body: string;
  tier: 'free' | 'pro';
  createdAt: string;
}

const INITIAL_PRODUCTS: Product[] = [
  {
    id: '01HGNV046D6QCTCXZ8KPN3FN9A',
    name: 'Combination Pliers',
    description: 'Heavy-duty chrome vanadium combination pliers with ergonomic grip.',
    price: 14.15,
    category: { id: 'cat-hand-tools', name: 'Hand Tools' },
    brand: { id: 'brand-forgeflex', name: 'ForgeFlex Tools' },
    in_stock: true,
  },
  {
    id: '01HGNV046D6QCTCXZ8KPN3FN9B',
    name: 'Bolt Cutters',
    description: 'High-leverage bolt cutters for industrial steel wire and chains.',
    price: 48.41,
    category: { id: 'cat-hand-tools', name: 'Hand Tools' },
    brand: { id: 'brand-mightycraft', name: 'MightyCraft Hardware' },
    in_stock: true,
  },
  {
    id: '01HGNV046D6QCTCXZ8KPN3FN9C',
    name: 'Thor Hammer',
    description: 'Drop-forged carbon steel sledgehammer with shock-reduction handle.',
    price: 11.14,
    category: { id: 'cat-hand-tools', name: 'Hand Tools' },
    brand: { id: 'brand-forgeflex', name: 'ForgeFlex Tools' },
    in_stock: true,
  },
  {
    id: '01HGNV046D6QCTCXZ8KPN3FN9D',
    name: 'Cordless Drill 20V',
    description: 'Brushless 20V Lithium-Ion cordless drill driver with 2 batteries.',
    price: 129.99,
    category: { id: 'cat-power-tools', name: 'Power Tools' },
    brand: { id: 'brand-mightycraft', name: 'MightyCraft Hardware' },
    in_stock: true,
  },
];

let products: Product[] = structuredClone(INITIAL_PRODUCTS);
const carts = new Map<string, CartItem[]>();
let webhookEvents: WebhookEvent[] = [];
let communityPosts: CommunityPost[] = [
  {
    id: 'post-1',
    author: 'Jane Doe (Customer)',
    title: 'Best torque settings for Cordless Drill 20V',
    body: 'Sharing my workshop guide for drilling hardwood vs steel brackets.',
    tier: 'free',
    createdAt: new Date().toISOString(),
  },
];
let userSubscriptions = new Map<string, 'free' | 'pro'>([
  ['customer@practicesoftwaretesting.com', 'free'],
]);

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_sentinela_secret';

function resetState() {
  products = structuredClone(INITIAL_PRODUCTS);
  carts.clear();
  webhookEvents = [];
  communityPosts = [
    {
      id: 'post-1',
      author: 'Jane Doe (Customer)',
      title: 'Best torque settings for Cordless Drill 20V',
      body: 'Sharing my workshop guide for drilling hardwood vs steel brackets.',
      tier: 'free',
      createdAt: new Date().toISOString(),
    },
  ];
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function renderHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Practice Software Testing - Toolshop v5.0</title>
  <style>
    :root {
      --primary: #1d4ed8;
      --primary-dark: #1e3a8a;
      --surface: #ffffff;
      --bg: #f8fafc;
      --text: #0f172a;
      --muted: #475569;
      --border: #cbd5e1;
      --success-bg: #dcfce7;
      --success-text: #14532d;
    }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
    body { margin: 0; background: var(--bg); color: var(--text); }
    header {
      background: #0f172a; color: #ffffff; padding: 1rem 2rem;
      display: flex; align-items: center; justify-content: space-between;
    }
    header a, header button {
      color: #ffffff; background: transparent; border: 1px solid #475569;
      padding: 0.5rem 0.9rem; border-radius: 6px; cursor: pointer; text-decoration: none;
      font-size: 0.95rem; margin-left: 0.5rem;
    }
    header a:hover, header button:hover { background: #1e293b; }
    main { max-width: 1100px; margin: 1.5rem auto; padding: 0 1.5rem; }
    .toolbar {
      display: flex; gap: 0.75rem; margin-bottom: 1.5rem; align-items: center; flex-wrap: wrap;
    }
    input, select, textarea {
      padding: 0.6rem 0.8rem; border: 1px solid #64748b; border-radius: 6px;
      font-size: 0.95rem; color: var(--text); background: var(--surface);
    }
    button.btn-primary {
      background: var(--primary); color: #ffffff; border: none;
      padding: 0.65rem 1.2rem; border-radius: 6px; font-weight: 600; cursor: pointer;
    }
    button.btn-primary:hover { background: var(--primary-dark); }
    .grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.25rem;
    }
    .card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;
    }
    .card h2 { font-size: 1.1rem; margin: 0 0 0.5rem; }
    .price { font-weight: 700; color: var(--primary); font-size: 1.1rem; margin-top: 0.5rem; }
    .banner-success {
      background: var(--success-bg); color: var(--success-text);
      padding: 1rem; border-radius: 6px; border: 1px solid #86efac; margin: 1rem 0; font-weight: 600;
    }
    .hidden { display: none !important; }
    .panel {
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 1.5rem; margin-bottom: 1.5rem;
    }
    .form-group { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.35rem; }
    label { font-weight: 600; font-size: 0.9rem; color: var(--text); }
    .badge {
      display: inline-block; padding: 0.2rem 0.55rem; border-radius: 999px;
      font-size: 0.75rem; font-weight: 700; background: #dbeafe; color: #1e3a8a;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <a href="#/" data-test="nav-home" id="nav-home" style="font-weight:700;border:none;font-size:1.15rem;margin-left:0;">
        🔧 Toolshop v5 &amp; Community
      </a>
    </div>
    <nav aria-label="Main Navigation">
      <button type="button" data-test="nav-home-btn" onclick="showView('catalog')">Catalog</button>
      <button type="button" data-test="nav-community" onclick="showView('community')">Creator Community</button>
      <button type="button" data-test="nav-cart" onclick="showView('checkout')">
        Cart (<span data-test="cart-quantity" id="cart-qty">0</span>)
      </button>
      <button type="button" data-test="nav-sign-in" id="nav-sign-in" onclick="showView('login')">Sign in</button>
      <span data-test="nav-menu" id="nav-user" class="hidden" style="margin-left:0.75rem;font-weight:600;">
        Jane Doe
      </span>
    </nav>
  </header>

  <main id="main-content">
    <!-- CATALOG VIEW -->
    <section id="view-catalog" aria-label="Product Catalog">
      <h1>Toolshop Catalog</h1>
      <form class="toolbar" onsubmit="handleSearch(event)">
        <label for="search-input">Search products</label>
        <input id="search-input" type="text" data-test="search-query" placeholder="Search tools..." />
        <button type="submit" class="btn-primary" data-test="search-submit">Search</button>
        <button type="button" data-test="search-reset" onclick="resetSearch()" style="padding:0.6rem 1rem;border-radius:6px;border:1px solid #64748b;background:#fff;cursor:pointer;">Reset</button>
        <label for="sort-select" style="margin-left:auto;">Sort by</label>
        <select id="sort-select" data-test="sort" onchange="handleSort(this.value)">
          <option value="">Default</option>
          <option value="price,asc">Price (Low - High)</option>
          <option value="price,desc">Price (High - Low)</option>
          <option value="name,asc">Name (A - Z)</option>
        </select>
      </form>
      <div id="product-grid" class="grid" data-test="search_completed"></div>
    </section>

    <!-- PRODUCT DETAIL VIEW -->
    <section id="view-detail" class="panel hidden" aria-label="Product Details">
      <button type="button" onclick="showView('catalog')" style="margin-bottom:1rem;padding:0.4rem 0.8rem;cursor:pointer;">← Back to catalog</button>
      <h1 data-test="product-name" id="detail-name"></h1>
      <span class="badge" id="detail-category"></span>
      <p data-test="product-description" id="detail-desc"></p>
      <p class="price">$<span data-test="unit-price" id="detail-price"></span></p>
      <div class="toolbar">
        <label for="quantity-input">Quantity</label>
        <input id="quantity-input" type="number" data-test="quantity" value="1" min="1" max="10" style="width:80px;" />
        <button type="button" class="btn-primary" data-test="add-to-cart" id="btn-add-to-cart" onclick="addToCart()">
          Add to cart
        </button>
      </div>
      <div id="cart-toast" class="banner-success hidden" role="alert" data-test="cart-alert">
        Product added to shopping cart.
      </div>
    </section>

    <!-- LOGIN VIEW -->
    <section id="view-login" class="panel hidden" aria-label="Customer Sign In">
      <h1>Customer Sign In</h1>
      <form onsubmit="handleLogin(event)">
        <div class="form-group">
          <label for="login-email">Email address</label>
          <input id="login-email" type="email" data-test="email" required value="" />
        </div>
        <div class="form-group">
          <label for="login-password">Password</label>
          <input id="login-password" type="password" data-test="password" required value="" />
        </div>
        <button type="submit" class="btn-primary" data-test="login-submit">Login</button>
      </form>
      <p id="login-error" data-test="login-error" class="hidden" style="color:#b91c1c;font-weight:600;"></p>
    </section>

    <!-- ACCOUNT / PROFILE VIEW -->
    <section id="view-account" class="panel hidden" aria-label="My Account">
      <h1 data-test="page-title">My account</h1>
      <p>Welcome back, <strong data-test="user-full-name">Jane Doe</strong> (<span id="account-tier" data-test="subscription-tier">free</span> tier)</p>
      <button type="button" class="btn-primary" onclick="showView('catalog')">Browse Catalog</button>
    </section>

    <!-- MULTI-STEP CHECKOUT VIEW -->
    <section id="view-checkout" class="panel hidden" aria-label="Checkout">
      <h1>Checkout</h1>
      <!-- Step 1: Cart Items -->
      <div id="checkout-step-1">
        <h2>Step 1: Cart Summary</h2>
        <div id="cart-items-list" data-test="cart-table"></div>
        <p style="font-weight:700;">Total: $<span data-test="cart-total" id="cart-total">0.00</span></p>
        <button type="button" class="btn-primary" data-test="proceed-1" onclick="goCheckoutStep(2)">
          Proceed to checkout
        </button>
      </div>

      <!-- Step 2: Sign-In Verification -->
      <div id="checkout-step-2" class="hidden">
        <h2>Step 2: Sign-In Verification</h2>
        <p id="step2-auth-msg">Hello Jane Doe, you are already logged in. You can proceed to billing address.</p>
        <button type="button" class="btn-primary" data-test="proceed-2" onclick="goCheckoutStep(3)">
          Proceed to checkout
        </button>
      </div>

      <!-- Step 3: Billing Address -->
      <div id="checkout-step-3" class="hidden">
        <h2>Step 3: Billing Address</h2>
        <div class="form-group">
          <label for="address">Address</label>
          <input id="address" data-test="address" value="Test Street 98" />
        </div>
        <div class="form-group">
          <label for="city">City</label>
          <input id="city" data-test="city" value="Vienna" />
        </div>
        <div class="form-group">
          <label for="state">State</label>
          <input id="state" data-test="state" value="Vienna" />
        </div>
        <div class="form-group">
          <label for="country">Country</label>
          <input id="country" data-test="country" value="AT" />
        </div>
        <div class="form-group">
          <label for="postcode">Postcode</label>
          <input id="postcode" data-test="postcode" value="1010" />
        </div>
        <button type="button" class="btn-primary" data-test="proceed-3" onclick="goCheckoutStep(4)">
          Proceed to checkout
        </button>
      </div>

      <!-- Step 4: Payment -->
      <div id="checkout-step-4" class="hidden">
        <h2>Step 4: Payment</h2>
        <div class="form-group">
          <label for="payment-method">Payment Method</label>
          <select id="payment-method" data-test="payment-method" onchange="togglePaymentFields(this.value)">
            <option value="">Choose your payment method</option>
            <option value="bank-transfer">Bank Transfer</option>
            <option value="cash-on-delivery">Cash on Delivery</option>
            <option value="credit-card">Credit Card (Stripe)</option>
            <option value="buy-now-pay-later">Buy Now Pay Later</option>
            <option value="gift-card">Gift Card</option>
          </select>
        </div>

        <div id="bank-fields" class="hidden">
          <div class="form-group">
            <label for="bank-name">Bank Name</label>
            <input id="bank-name" data-test="bank_name" value="Test Bank" />
          </div>
          <div class="form-group">
            <label for="account-name">Account Name</label>
            <input id="account-name" data-test="account_name" value="Jane Doe" />
          </div>
          <div class="form-group">
            <label for="account-number">Account Number</label>
            <input id="account-number" data-test="account_number" value="9876543210" />
          </div>
        </div>

        <div id="cc-fields" class="hidden">
          <div class="form-group">
            <label for="cc-number">Credit Card Number</label>
            <input id="cc-number" data-test="credit_card_number" value="0000-1111-2222-3333" />
          </div>
          <div class="form-group">
            <label for="cc-exp">Expiration Date</label>
            <input id="cc-exp" data-test="expiration_date" value="12/2029" />
          </div>
          <div class="form-group">
            <label for="cc-cvv">CVV</label>
            <input id="cc-cvv" data-test="cvv" value="123" />
          </div>
          <div class="form-group">
            <label for="cc-holder">Card Holder Name</label>
            <input id="cc-holder" data-test="card_holder_name" value="Jane Doe" />
          </div>
        </div>

        <button type="button" class="btn-primary" data-test="finish" onclick="submitPayment()">
          Confirm
        </button>

        <div id="payment-success" data-test="payment-success-message" class="banner-success hidden" role="status">
          Payment was successful
        </div>
        <div id="payment-error" data-test="payment-error-message" class="hidden" style="color:#b91c1c;font-weight:700;margin-top:0.75rem;" role="alert"></div>
      </div>
    </section>

    <!-- CREATOR COMMUNITY FEED VIEW -->
    <section id="view-community" class="panel hidden" aria-label="Creator Community Feed">
      <h1>Builder &amp; Creator Community Feed</h1>
      <p>Share project tips, tool reviews, or access Pro Workshop spaces.</p>
      <form onsubmit="publishPost(event)" style="margin-bottom:1.5rem;">
        <div class="form-group">
          <label for="post-title">Post Title</label>
          <input id="post-title" data-test="post-title" placeholder="Title of your discussion..." required />
        </div>
        <div class="form-group">
          <label for="post-body">Share something with your community...</label>
          <textarea id="post-body" data-test="post-body" aria-label="Share something with your community..." rows="3" required></textarea>
        </div>
        <button type="submit" class="btn-primary" data-test="publish-post">Publish</button>
      </form>
      <div id="community-feed-list" data-test="community-feed"></div>
    </section>
  </main>

  <script>
    let allProducts = [];
    let selectedProduct = null;
    let cartItems = [];

    function syncAuthUi() {
      const token = localStorage.getItem('auth-token');
      const signInBtn = document.getElementById('nav-sign-in');
      const userBadge = document.getElementById('nav-user');
      if (token) {
        signInBtn.classList.add('hidden');
        userBadge.classList.remove('hidden');
      } else {
        signInBtn.classList.remove('hidden');
        userBadge.classList.add('hidden');
      }
    }

    function showView(view) {
      ['catalog', 'detail', 'login', 'account', 'checkout', 'community'].forEach(v => {
        document.getElementById('view-' + v).classList.add('hidden');
      });
      document.getElementById('view-' + view).classList.remove('hidden');
      syncAuthUi();
      if (view === 'checkout') renderCart();
      if (view === 'community') loadCommunityFeed();
    }

    async function loadProducts(query = '', sort = '') {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (sort) params.set('sort', sort);
      const res = await fetch('/api/products?' + params.toString());
      const body = await res.json();
      allProducts = body.data || [];
      renderProducts(allProducts);
    }

    function renderProducts(list) {
      const grid = document.getElementById('product-grid');
      if (!list.length) {
        grid.innerHTML = '<p data-test="no-results">There are no products found.</p>';
        return;
      }
      grid.innerHTML = list.map(p => \`
        <article class="card" data-test="product-\${p.id}" onclick="openProduct('\${p.id}')" style="cursor:pointer;">
          <div>
            <span class="badge">\${p.category.name}</span>
            <h2 data-test="product-name" style="margin-top:0.5rem;">\${p.name}</h2>
            <p style="color:#475569;font-size:0.9rem;">\${p.description}</p>
          </div>
          <div class="price" data-test="product-price">$\${p.price.toFixed(2)}</div>
        </article>
      \`).join('');
    }

    function openProduct(id) {
      selectedProduct = allProducts.find(p => p.id === id);
      if (!selectedProduct) return;
      document.getElementById('detail-name').textContent = selectedProduct.name;
      document.getElementById('detail-category').textContent = selectedProduct.category.name;
      document.getElementById('detail-desc').textContent = selectedProduct.description;
      document.getElementById('detail-price').textContent = selectedProduct.price.toFixed(2);
      document.getElementById('cart-toast').classList.add('hidden');
      showView('detail');
    }

    async function addToCart() {
      if (!selectedProduct) return;
      const qty = parseInt(document.getElementById('quantity-input').value || '1', 10);
      cartItems.push({ product: selectedProduct, quantity: qty });
      const totalQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      document.getElementById('cart-qty').textContent = String(totalQty);
      document.getElementById('cart-toast').classList.remove('hidden');
    }

    function renderCart() {
      const container = document.getElementById('cart-items-list');
      if (!cartItems.length) {
        container.innerHTML = '<p>Your cart is empty.</p>';
        document.getElementById('cart-total').textContent = '0.00';
        return;
      }
      let total = 0;
      container.innerHTML = cartItems.map(item => {
        const line = item.product.price * item.quantity;
        total += line;
        return \`<div data-test="cart-item" style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #e2e8f0;">
          <span data-test="product-title">\${item.product.name} (x\${item.quantity})</span>
          <span data-test="line-price">$\${line.toFixed(2)}</span>
        </div>\`;
      }).join('');
      document.getElementById('cart-total').textContent = total.toFixed(2);
    }

    function goCheckoutStep(step) {
      [1, 2, 3, 4].forEach(s => {
        document.getElementById('checkout-step-' + s).classList.toggle('hidden', s !== step);
      });
    }

    function togglePaymentFields(method) {
      document.getElementById('bank-fields').classList.toggle('hidden', method !== 'bank-transfer');
      document.getElementById('cc-fields').classList.toggle('hidden', method !== 'credit-card');
    }

    async function submitPayment() {
      const method = document.getElementById('payment-method').value;
      const errEl = document.getElementById('payment-error');
      const okEl = document.getElementById('payment-success');
      errEl.classList.add('hidden');
      okEl.classList.add('hidden');

      const res = await fetch('/api/payment/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: 'Payment gateway error' }));
        errEl.textContent = errBody.message || 'Payment failed (500)';
        errEl.classList.remove('hidden');
        return;
      }
      okEl.classList.remove('hidden');
      cartItems = [];
      document.getElementById('cart-qty').textContent = '0';
    }

    async function handleSearch(e) {
      e.preventDefault();
      const q = document.getElementById('search-input').value;
      await loadProducts(q, document.getElementById('sort-select').value);
    }

    async function resetSearch() {
      document.getElementById('search-input').value = '';
      document.getElementById('sort-select').value = '';
      await loadProducts();
    }

    async function handleSort(sortVal) {
      const q = document.getElementById('search-input').value;
      await loadProducts(q, sortVal);
    }

    async function handleLogin(e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const err = document.getElementById('login-error');
        err.textContent = 'Invalid email or password';
        err.classList.remove('hidden');
        return;
      }
      const data = await res.json();
      localStorage.setItem('auth-token', data.access_token);
      syncAuthUi();
      showView('account');
    }

    async function loadCommunityFeed() {
      const res = await fetch('/api/community/posts');
      const body = await res.json();
      const container = document.getElementById('community-feed-list');
      container.innerHTML = (body.data || []).map(p => \`
        <article class="card" data-test="feed-item" style="margin-bottom:0.85rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong data-test="feed-item-title">\${p.title}</strong>
            <span class="badge">\${p.tier.toUpperCase()}</span>
          </div>
          <p data-test="feed-item-body">\${p.body}</p>
          <small style="color:#475569;">Posted by \${p.author}</small>
        </article>
      \`).join('');
    }

    async function publishPost(e) {
      e.preventDefault();
      const title = document.getElementById('post-title').value;
      const body = document.getElementById('post-body').value;
      await fetch('/api/community/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('auth-token') || '')
        },
        body: JSON.stringify({ title, body })
      });
      document.getElementById('post-title').value = '';
      document.getElementById('post-body').value = '';
      await loadCommunityFeed();
    }

    window.addEventListener('hashchange', () => {
      const h = window.location.hash;
      if (h.includes('/auth/login')) showView('login');
      else if (h.includes('/account')) showView('account');
      else if (h.includes('/checkout')) showView('checkout');
      else if (h.includes('/community')) showView('community');
      else showView('catalog');
    });

    // Initial boot
    syncAuthUi();
    loadProducts();
    if (window.location.hash.includes('/auth/login')) showView('login');
    else if (window.location.hash.includes('/account')) showView('account');
    else if (window.location.hash.includes('/community')) showView('community');
  </script>
</body>
</html>`;
}

export function createSandboxServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 200, {});
    }

    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:4201');
    const pathname = reqUrl.pathname.replace(/^\/api/, '') || '/';
    const isApi = (req.url || '').startsWith('/api') || pathname.startsWith('/users') || pathname.startsWith('/products') || pathname.startsWith('/carts') || pathname.startsWith('/payment') || pathname.startsWith('/webhooks');

    try {
      // 1. Test State Reset Endpoint
      if (req.method === 'POST' && pathname === '/test/reset') {
        resetState();
        return sendJson(res, 200, { status: 'reset_ok' });
      }

      // 2. Authentication: POST /users/login
      if (req.method === 'POST' && pathname === '/users/login') {
        const raw = await parseBody(req);
        const { email, password } = JSON.parse(raw || '{}');
        if (
          (email === 'customer@practicesoftwaretesting.com' || email === 'admin@practicesoftwaretesting.com') &&
          password === 'welcome01'
        ) {
          const token = Buffer.from(
            JSON.stringify({ sub: 'user-customer-01', email, role: 'customer', iat: Date.now() })
          ).toString('base64');
          return sendJson(res, 200, {
            access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${token}.sentinela_sig`,
            token_type: 'bearer',
            expires_in: 3600,
          });
        }
        return sendJson(res, 401, { error: 'Unauthorized', message: 'Invalid email or password' });
      }

      // 3. Current User Profile: GET /users/me
      if (req.method === 'GET' && pathname === '/users/me') {
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) {
          return sendJson(res, 401, { message: 'Unauthenticated' });
        }
        const email = 'customer@practicesoftwaretesting.com';
        return sendJson(res, 200, {
          id: 'user-customer-01',
          first_name: 'Jane',
          last_name: 'Doe',
          email,
          subscription_tier: userSubscriptions.get(email) || 'free',
        });
      }

      // 4. Products Catalog: GET /products & GET /products/:id
      if (req.method === 'GET' && pathname === '/products') {
        const q = (reqUrl.searchParams.get('q') || '').toLowerCase();
        const sort = reqUrl.searchParams.get('sort') || '';
        let list = [...products];
        if (q) {
          list = list.filter(
            (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
          );
        }
        if (sort === 'price,asc') list.sort((a, b) => a.price - b.price);
        if (sort === 'price,desc') list.sort((a, b) => b.price - a.price);
        if (sort === 'name,asc') list.sort((a, b) => a.name.localeCompare(b.name));

        return sendJson(res, 200, {
          current_page: 1,
          data: list,
          total: list.length,
        });
      }

      if (req.method === 'GET' && pathname.startsWith('/products/')) {
        const id = pathname.split('/')[2];
        const product = products.find((p) => p.id === id);
        if (!product) return sendJson(res, 404, { message: 'Product not found' });
        return sendJson(res, 200, product);
      }

      // 5. Shopping Cart API: POST /carts, POST /carts/:id, GET /carts/:id
      if (req.method === 'POST' && pathname === '/carts') {
        const cartId = `cart-${crypto.randomUUID().slice(0, 8)}`;
        carts.set(cartId, []);
        return sendJson(res, 201, { id: cartId });
      }

      if (pathname.startsWith('/carts/')) {
        const cartId = pathname.split('/')[2];
        if (req.method === 'POST') {
          const raw = await parseBody(req);
          const { product_id, quantity = 1 } = JSON.parse(raw || '{}');
          const product = products.find((p) => p.id === product_id) || products[0];
          const items = carts.get(cartId) || [];
          items.push({ product_id: product.id, quantity, product });
          carts.set(cartId, items);
          return sendJson(res, 200, { id: cartId, cart_items: items });
        }
        if (req.method === 'GET') {
          const items = carts.get(cartId) || [];
          return sendJson(res, 200, { id: cartId, cart_items: items });
        }
      }

      // 6. Payment Validation: POST /payment/check
      if (req.method === 'POST' && pathname === '/payment/check') {
        const raw = await parseBody(req);
        const body = JSON.parse(raw || '{}');
        if (!body.payment_method) {
          return sendJson(res, 422, { message: 'Payment method is required' });
        }
        return sendJson(res, 200, { message: 'Payment was successful' });
      }

      // 7. Stripe Webhook Receiver & Event Log: POST /webhooks/stripe & GET /webhooks/events
      if (req.method === 'POST' && pathname === '/webhooks/stripe') {
        const raw = await parseBody(req);
        const signatureHeader = (req.headers['stripe-signature'] as string) || '';
        const expectedSig = crypto
          .createHmac('sha256', WEBHOOK_SECRET)
          .update(raw)
          .digest('hex');

        const isVerified = signatureHeader === `t=1700000000,v1=${expectedSig}` || signatureHeader === expectedSig;
        if (!isVerified) {
          return sendJson(res, 400, { error: 'Invalid Stripe webhook signature' });
        }

        const payload = JSON.parse(raw || '{}');
        const event: WebhookEvent = {
          id: payload.id || `evt_${crypto.randomUUID().slice(0, 8)}`,
          type: payload.type || 'customer.subscription.created',
          created: Date.now(),
          data: payload.data || { object: {} },
          verified: true,
        };
        webhookEvents.push(event);

        if (event.type === 'customer.subscription.created') {
          const customerEmail =
            (event.data.object.customer_email as string) || 'customer@practicesoftwaretesting.com';
          userSubscriptions.set(customerEmail, 'pro');
        }

        return sendJson(res, 200, { received: true, event_id: event.id });
      }

      if (req.method === 'GET' && pathname === '/webhooks/events') {
        return sendJson(res, 200, { data: webhookEvents });
      }

      // 8. Community Feed Endpoints: GET /community/posts & POST /community/posts
      if (req.method === 'GET' && pathname === '/community/posts') {
        return sendJson(res, 200, { data: communityPosts });
      }

      if (req.method === 'POST' && pathname === '/community/posts') {
        const raw = await parseBody(req);
        const { title, body, tier = 'free' } = JSON.parse(raw || '{}');
        const post: CommunityPost = {
          id: `post-${communityPosts.length + 1}`,
          author: 'Jane Doe (Customer)',
          title: title || 'Community Update',
          body: body || '',
          tier,
          createdAt: new Date().toISOString(),
        };
        communityPosts.unshift(post);
        return sendJson(res, 201, post);
      }

      // Serve SPA UI for non-API GET requests
      if (!isApi && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(renderHtml());
      }

      return sendJson(res, 404, { message: `Route ${pathname} not found` });
    } catch (err: any) {
      return sendJson(res, 500, { message: err?.message || 'Internal Server Error' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4201);
  const server = createSandboxServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`🔧 Sentinela Toolshop & Webhook Sandbox running at http://127.0.0.1:${port}`);
  });
}
