
/* =========================================
   SWEETÉ PÂTISSERIE
   OWNER DASHBOARD - UPGRADED
========================================= */

/* 1. SUPABASE CONFIGURATION */

const SUPABASE_URL = "https://veylufvzfhdnyhqxtuba.supabase.co";
const SUPABASE_KEY = "sb_publishable_3FHzpnKJ_MUKIeNMg-WuBw_hzlss_rP";
const OWNER_UID = "72f543d0-3117-46c8-9a11-d7bd2fee6616";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


/* 2. ELEMENT REFERENCES */

const $ = id => document.getElementById(id);

const loginSection = $("loginSection");
const dashboardSection = $("dashboardSection");
const loginForm = $("loginForm");
const loginError = $("loginError");
const logoutBtn = $("logoutBtn");

const productForm = $("productForm");
const productFormTitle = $("productFormTitle");
const productSubmitBtn = $("productSubmitBtn");
const cancelEditBtn = $("cancelEditBtn");
const productMessage = $("productMessage");
const productsTableBody = $("productsTableBody");

const ordersContainer = $("ordersContainer");
const refreshOrdersBtn = $("refreshOrdersBtn");
const orderSearch = $("orderSearch");
const orderStatusFilter = $("orderStatusFilter");

const storeSettingsForm = $("storeSettingsForm");
const settingsMessage = $("settingsMessage");
const saveSettingsBtn = $("saveSettingsBtn");

const reportPeriod = $("reportPeriod");

let currentProducts = [];
let currentOrders = [];
let currentOwner = null;
let salesChart = null;
let realtimeChannel = null;
let notificationEnabled = false;
let notificationPermission = "default";
let knownOrderIds = new Set();
let unreadNotifications = 0;


/* 3. HELPER FUNCTIONS */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function formatRupiah(value) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0
    }).format(Number(value) || 0);
}

function safeImageURL(value) {
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}

function showMessage(element, message, type = "error") {
    element.textContent = message;
    element.className = "message " + type;
}

function clearMessage(element) {
    element.textContent = "";
    element.className = "message";
}

function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getStatusClass(status) {
    const classes = {
        "Menunggu konfirmasi": "status-menunggu",
        "Diproses": "status-diproses",
        "Sedang dikirim": "status-dikirim",
        "Selesai": "status-selesai",
        "Dibatalkan": "status-dibatalkan"
    };

    return classes[status] || "";
}

function parseOrderItems(items) {
    if (!items) return [];

    if (typeof items === "string") {
        try {
            items = JSON.parse(items);
        } catch {
            return [];
        }
    }

    return Array.isArray(items) ? items : [];
}

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    result.setDate(result.getDate() - ((day + 6) % 7));
    result.setHours(0, 0, 0, 0);
    return result;
}


/* 4. LOGIN DAN SESSION */

function showLogin() {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
}

function showDashboard() {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
}

async function verifyOwner(user) {
    if (!user || user.id !== OWNER_UID) {
        await db.auth.signOut();
        showLogin();

        showMessage(
            loginError,
            "Akun ini tidak memiliki akses sebagai owner."
        );

        return false;
    }

    currentOwner = user;
    showDashboard();
    return true;
}

loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage(loginError);

    const email = $("ownerEmail").value.trim();
    const password = $("ownerPassword").value;
    const button = loginForm.querySelector("button[type='submit']");

    button.disabled = true;
    button.textContent = "Sedang login...";

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        if (await verifyOwner(data.user)) {
            loginForm.reset();
            await loadDashboard();
        }
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        showMessage(loginError, error.message || "Login gagal.");
    } finally {
        button.disabled = false;
        button.textContent = "Login Dashboard";
    }
});

logoutBtn.addEventListener("click", async () => {
    if (!confirm("Apakah kamu yakin ingin logout?")) return;

    if (realtimeChannel) {
        await db.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }

    const { error } = await db.auth.signOut();

    if (error) {
        alert("Gagal logout: " + error.message);
        return;
    }

    currentOwner = null;
    currentProducts = [];
    currentOrders = [];
    showLogin();
});

async function initializeAuth() {
    const { data, error } = await db.auth.getSession();

    if (error) {
        console.error("SESSION ERROR:", error);
        showLogin();
        return;
    }

    if (data.session?.user) {
        if (await verifyOwner(data.session.user)) {
            await loadDashboard();
        }
    } else {
        showLogin();
    }
}


/* 5. LOAD DASHBOARD */

async function loadDashboard() {
    if (!currentOwner) return;

    await Promise.all([
        loadProducts(),
        loadOrders(),
        loadStoreSettings()
    ]);

    updateStatistics();
    updateSalesReport();
    subscribeToNewOrders();
}


/* 6. LOAD PRODUCTS */

async function loadProducts() {
    productsTableBody.innerHTML = `
        <tr><td colspan="6" class="empty-state">Memuat data menu...</td></tr>
    `;

    const { data, error } = await db
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("LOAD PRODUCTS ERROR:", error);
        productsTableBody.innerHTML = `
            <tr><td colspan="6" class="empty-state">Gagal memuat menu.</td></tr>
        `;
        return;
    }

    currentProducts = data || [];
    renderProducts();
    updateStatistics();
}

function renderProducts() {
    if (!currentProducts.length) {
        productsTableBody.innerHTML = `
            <tr><td colspan="6" class="empty-state">Belum ada menu.</td></tr>
        `;
        return;
    }

    productsTableBody.innerHTML = currentProducts.map(product => {
        const imageURL = safeImageURL(product.image);

        const imageHTML = imageURL
            ? `<img src="${escapeHTML(imageURL)}" alt="${escapeHTML(product.name)}" loading="lazy">`
            : `<div class="product-placeholder">S</div>`;

        const stock = Number(product.stock) || 0;

        let statusHTML;

        if (product.is_archived) {
            statusHTML = `<span class="status-badge status-unavailable">Diarsipkan</span>`;
        } else if (stock <= 0) {
            statusHTML = `<span class="status-badge status-unavailable">Stok habis</span>`;
        } else if (stock <= 5) {
            statusHTML = `<span class="status-badge status-low-stock">Stok menipis</span>`;
        } else if (product.is_available === false) {
            statusHTML = `<span class="status-badge status-unavailable">Tidak tersedia</span>`;
        } else {
            statusHTML = `<span class="status-badge status-available">Tersedia</span>`;
        }

        return `
            <tr>
                <td>
                    <div class="product-cell">
                        ${imageHTML}
                        <div><strong>${escapeHTML(product.name)}</strong></div>
                    </div>
                </td>
                <td><span class="product-category">${escapeHTML(product.category)}</span></td>
                <td><strong>${formatRupiah(product.price)}</strong></td>
                <td>
                    <strong class="${stock <= 5 ? "stock-warning" : ""}">
                        ${stock}
                    </strong>
                </td>
                <td>${statusHTML}</td>
                <td>
                    <div class="action-buttons">
                        ${
                            product.is_archived
                            ? `<button type="button" class="btn-edit" data-action="restore" data-id="${product.id}">Pulihkan</button>`
                            : `
                                <button type="button" class="btn-edit" data-action="edit" data-id="${product.id}">Edit</button>
                                <button type="button" class="btn-delete" data-action="delete" data-id="${product.id}">Arsip</button>
                            `
                        }
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


/* 7. PRODUCT ACTIONS */

productsTableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button || !currentOwner) return;

    const action = button.dataset.action;
    const productId = button.dataset.id;

    button.disabled = true;

    try {
        if (action === "edit") editProduct(productId);
        if (action === "delete") await deleteProduct(productId);
        if (action === "restore") await restoreProduct(productId);
    } catch (error) {
        console.error("PRODUCT ACTION ERROR:", error);
        alert(error.message);
    } finally {
        if (button.isConnected) button.disabled = false;
    }
});

async function deleteProduct(productId) {
    const product = currentProducts.find(item => String(item.id) === String(productId));
    if (!product) return;

    if (!confirm(`Arsipkan menu "${product.name}"?`)) return;

    const { error } = await db
        .from("products")
        .update({ is_archived: true })
        .eq("id", productId);

    if (error) throw error;

    await loadProducts();
    alert("Menu berhasil diarsipkan.");
}

async function restoreProduct(productId) {
    const product = currentProducts.find(item => String(item.id) === String(productId));
    if (!product) return;

    if (!confirm(`Pulihkan menu "${product.name}"?`)) return;

    const { error } = await db
        .from("products")
        .update({ is_archived: false })
        .eq("id", productId);

    if (error) throw error;

    await loadProducts();
    alert("Menu berhasil dipulihkan.");
}


/* 8. ADD AND UPDATE PRODUCT */

productForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentOwner) return;

    clearMessage(productMessage);

    const productId = $("productId").value;
    const stockValue = $("productStock").value;
    const stock = Number(stockValue);

    const productData = {
        name: $("productName").value.trim(),
        category: $("productCategory").value,
        price: Number($("productPrice").value),
        stock,
        tag: $("productTag").value.trim(),
        image: $("productImage").value.trim(),
        description: $("productDescription").value.trim(),
        is_available: $("productAvailable").checked && stock > 0
    };

    if (!productData.name || !productData.category) {
        showMessage(productMessage, "Nama dan kategori menu wajib diisi.");
        return;
    }

    if (!Number.isFinite(productData.price) || productData.price < 0) {
        showMessage(productMessage, "Harga tidak valid.");
        return;
    }

    if (stockValue === "" || !Number.isInteger(stock) || stock < 0) {
        showMessage(productMessage, "Stok harus berupa angka bulat dan tidak negatif.");
        return;
    }

    if (productData.image && !safeImageURL(productData.image)) {
        showMessage(productMessage, "URL gambar harus menggunakan HTTP atau HTTPS.");
        return;
    }

    productSubmitBtn.disabled = true;
    productSubmitBtn.textContent = "Menyimpan...";

    try {
        let result;

        if (productId) {
            result = await db
                .from("products")
                .update(productData)
                .eq("id", Number(productId));
        } else {
            result = await db
                .from("products")
                .insert([productData]);
        }

        if (result.error) throw result.error;

        resetProductForm();
        await loadProducts();

        showMessage(
            productMessage,
            productId ? "Menu berhasil diperbarui!" : "Menu baru berhasil ditambahkan!",
            "success"
        );
    } catch (error) {
        console.error("SAVE PRODUCT ERROR:", error);
        showMessage(productMessage, "Gagal menyimpan menu: " + error.message);
    } finally {
        productSubmitBtn.disabled = false;
        productSubmitBtn.textContent = $("productId").value
            ? "Simpan Perubahan"
            : "+ Tambahkan Menu";
    }
});

function editProduct(productId) {
    const product = currentProducts.find(item => String(item.id) === String(productId));
    if (!product) return;

    $("productId").value = product.id;
    $("productName").value = product.name || "";
    $("productCategory").value = product.category || "";
    $("productPrice").value = product.price ?? 0;
    $("productStock").value = Number(product.stock) || 0;
    $("productTag").value = product.tag || "";
    $("productImage").value = product.image || "";
    $("productDescription").value = product.description || "";

    $("productAvailable").checked =
        product.is_available !== false && Number(product.stock) > 0;

    productFormTitle.textContent = "Edit Menu";
    productSubmitBtn.textContent = "Simpan Perubahan";
    cancelEditBtn.hidden = false;

    clearMessage(productMessage);

    $("products").scrollIntoView({ behavior: "smooth" });
    $("productName").focus();
}

function resetProductForm() {
    productForm.reset();
    $("productId").value = "";
    $("productStock").value = 0;
    $("productAvailable").checked = true;

    productFormTitle.textContent = "Tambah Menu Baru";
    productSubmitBtn.textContent = "+ Tambahkan Menu";
    cancelEditBtn.hidden = true;
}

cancelEditBtn.addEventListener("click", () => {
    resetProductForm();
    clearMessage(productMessage);
});


/* 9. LOAD ORDERS */

async function loadOrders() {
    ordersContainer.innerHTML = `<p class="empty-state">Memuat pesanan...</p>`;

    const { data, error } = await db
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("LOAD ORDERS ERROR:", error);
        ordersContainer.innerHTML = `
            <p class="empty-state">Gagal memuat pesanan. Periksa izin akses tabel orders.</p>
        `;
        return;
    }

    currentOrders = data || [];
    renderOrders();
    updateStatistics();
    updateSalesReport();
}


/* 10. RENDER ORDER ITEMS */

function formatOrderItems(items) {
    const parsedItems = parseOrderItems(items);

    if (!parsedItems.length) return "Tidak ada detail produk.";

    return parsedItems.map(item => {
        const name = item.name || item.title || "Produk";
        const quantity = item.qty ?? item.quantity ?? 1;
        const price = Number(item.price) || 0;

        return `
            <div class="order-item-row">
                <span>${escapeHTML(name)} × ${escapeHTML(quantity)}</span>
                <strong>${formatRupiah(price * Number(quantity))}</strong>
            </div>
        `;
    }).join("");
}


/* 11. RENDER ORDERS */

function renderOrders() {
    const keyword = orderSearch.value.trim().toLowerCase();
    const selectedStatus = orderStatusFilter.value;

    const filteredOrders = currentOrders.filter(order => {
        const searchableText = [
            order.customer_name,
            order.order_code,
            order.customer_phone
        ].join(" ").toLowerCase();

        return searchableText.includes(keyword) &&
            (selectedStatus === "all" || order.status === selectedStatus);
    });

    if (!filteredOrders.length) {
        ordersContainer.innerHTML = `<p class="empty-state">Tidak ada pesanan yang sesuai.</p>`;
        return;
    }

    ordersContainer.innerHTML = filteredOrders.map(order => {
        const statusClass = getStatusClass(order.status);

        return `
            <article class="order-card">
                <div class="order-card-header">
                    <div>
                        <h3>${escapeHTML(order.customer_name || "Pelanggan")}</h3>
                        <p class="order-code">Kode: ${escapeHTML(order.order_code || "-")}</p>
                    </div>
                    <span class="status-badge ${statusClass}">
                        ${escapeHTML(order.status || "Belum ada status")}
                    </span>
                </div>

                <div class="order-details">
                    <div class="order-detail">
                        <span>Nomor Telepon</span>
                        <strong>${escapeHTML(order.customer_phone || "-")}</strong>
                    </div>
                    <div class="order-detail">
                        <span>Tanggal Pesanan</span>
                        <strong>${escapeHTML(formatDate(order.created_at))}</strong>
                    </div>
                    <div class="order-detail">
                        <span>Alamat Pengiriman</span>
                        <strong>${escapeHTML(order.delivery_address || "-")}</strong>
                    </div>
                    <div class="order-detail">
                        <span>Tanggal Pengiriman</span>
                        <strong>${escapeHTML(order.delivery_date || "-")}</strong>
                    </div>
                    <div class="order-detail">
                        <span>Metode Pembayaran</span>
                        <strong>${escapeHTML(order.payment_method || "-")}</strong>
                    </div>
                    <div class="order-detail">
                        <span>Catatan</span>
                        <strong>${escapeHTML(order.note || "-")}</strong>
                    </div>
                </div>

                <div class="order-items">
                    <strong>Detail Produk:</strong>
                    ${formatOrderItems(order.items)}
                </div>

                <div class="order-total">
                    <span>Subtotal</span>
                    <strong>${formatRupiah(order.subtotal)}</strong>
                </div>

                <div class="order-total">
                    <span>Biaya Pengiriman</span>
                    <strong>${formatRupiah(order.shipping_fee)}</strong>
                </div>

                <div class="order-total">
                    <span>Total Pembayaran</span>
                    <strong>${formatRupiah(order.total)}</strong>
                </div>

                <div class="order-status-control">
                    <label for="status-${order.id}">Ubah Status Pesanan</label>
                    <select id="status-${order.id}" class="order-status-select" data-id="${order.id}">
                        <option value="Menunggu konfirmasi" ${order.status === "Menunggu konfirmasi" ? "selected" : ""}>Menunggu Konfirmasi</option>
                        <option value="Diproses" ${order.status === "Diproses" ? "selected" : ""}>Diproses</option>
                        <option value="Sedang dikirim" ${order.status === "Sedang dikirim" ? "selected" : ""}>Sedang Dikirim</option>
                        <option value="Selesai" ${order.status === "Selesai" ? "selected" : ""}>Selesai</option>
                        <option value="Dibatalkan" ${order.status === "Dibatalkan" ? "selected" : ""}>Dibatalkan</option>
                    </select>
                </div>
            </article>
        `;
    }).join("");
}


/* 12. UPDATE ORDER STATUS */

ordersContainer.addEventListener("change", async event => {
    const select = event.target.closest(".order-status-select");
    if (!select || !currentOwner) return;

    const orderId = select.dataset.id;
    const newStatus = select.value;

    const order = currentOrders.find(item => String(item.id) === String(orderId));
    if (!order) return;

    const previousStatus = order.status;
    select.disabled = true;

    try {
        const { error } = await db
            .from("orders")
            .update({ status: newStatus })
            .eq("id", orderId);

        if (error) throw error;

        order.status = newStatus;
        renderOrders();
        updateStatistics();
        updateSalesReport();

        alert("Status pesanan berhasil diperbarui.");
    } catch (error) {
        console.error("UPDATE ORDER ERROR:", error);
        alert("Gagal memperbarui status: " + error.message);
        select.value = previousStatus;
        select.disabled = false;
    }
});


/* 13. SEARCH, FILTER, REFRESH */

orderSearch.addEventListener("input", renderOrders);
orderStatusFilter.addEventListener("change", renderOrders);

refreshOrdersBtn.addEventListener("click", async () => {
    refreshOrdersBtn.disabled = true;
    refreshOrdersBtn.textContent = "Memuat...";

    await Promise.all([loadOrders(), loadProducts()]);

    refreshOrdersBtn.disabled = false;
    refreshOrdersBtn.textContent = "↻ Refresh Pesanan";
});


/* 14. DASHBOARD STATISTICS */

function updateStatistics() {
    const totalOrders = currentOrders.length;

    const pendingOrders = currentOrders.filter(order =>
        order.status === "Menunggu konfirmasi"
    ).length;

    const processingOrders = currentOrders.filter(order =>
        ["Diproses", "Sedang dikirim"].includes(order.status)
    ).length;

    const completedOrders = currentOrders.filter(order =>
        order.status === "Selesai"
    );

    const revenue = completedOrders.reduce((sum, order) =>
        sum + (Number(order.total) || 0), 0
    );

    const activeProducts = currentProducts.filter(product =>
        product.is_archived !== true
    );

    const lowStock = activeProducts.filter(product =>
        Number(product.stock) > 0 && Number(product.stock) <= 5
    ).length;

    const outStock = activeProducts.filter(product =>
        Number(product.stock) <= 0
    ).length;

    $("statTotalOrders").textContent = totalOrders;
    $("statPendingOrders").textContent = pendingOrders;
    $("statRevenue").textContent = formatRupiah(revenue);
    $("statProducts").textContent = activeProducts.length;

    $("statLowStock").textContent = lowStock;
    $("statOutStock").textContent = outStock;
    $("statProcessing").textContent = processingOrders;
}


/* 15. SALES REPORT CHART */

function updateSalesReport() {
    if (typeof Chart === "undefined") {
        console.error("Chart.js belum berhasil dimuat.");
        return;
    }

    const period = reportPeriod.value;
    const completedOrders = currentOrders.filter(order =>
        order.status === "Selesai"
    );

    let labels = [];
    let values = [];
    let counts = [];
    let buckets = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (period === "daily") {
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);

            buckets.push({
                key: getLocalDateKey(date),
                label: date.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short"
                }),
                revenue: 0,
                count: 0
            });
        }

        const map = new Map(buckets.map(bucket => [bucket.key, bucket]));

        completedOrders.forEach(order => {
            if (!order.created_at) return;
            const date = new Date(order.created_at);
            const bucket = map.get(getLocalDateKey(date));

            if (bucket) {
                bucket.revenue += Number(order.total) || 0;
                bucket.count++;
            }
        });

    } else if (period === "weekly") {
        for (let i = 3; i >= 0; i--) {
            const date = getStartOfWeek(today);
            date.setDate(date.getDate() - (i * 7));

            buckets.push({
                key: getLocalDateKey(date),
                start: date,
                end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7),
                label: `Minggu ${4 - i}`,
                revenue: 0,
                count: 0
            });
        }

        completedOrders.forEach(order => {
            if (!order.created_at) return;
            const date = new Date(order.created_at);

            const bucket = buckets.find(item =>
                date >= item.start && date < item.end
            );

            if (bucket) {
                bucket.revenue += Number(order.total) || 0;
                bucket.count++;
            }
        });

        buckets.forEach(bucket => {
            bucket.label = bucket.start.toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short"
            });
        });

    } else {
        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);

            buckets.push({
                key: `${date.getFullYear()}-${date.getMonth()}`,
                label: date.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
                revenue: 0,
                count: 0
            });
        }

        const map = new Map(buckets.map(bucket => [bucket.key, bucket]));

        completedOrders.forEach(order => {
            if (!order.created_at) return;
            const date = new Date(order.created_at);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            const bucket = map.get(key);

            if (bucket) {
                bucket.revenue += Number(order.total) || 0;
                bucket.count++;
            }
        });
    }

    labels = buckets.map(bucket => bucket.label);
    values = buckets.map(bucket => bucket.revenue);
    counts = buckets.map(bucket => bucket.count);

    const totalRevenue = values.reduce((sum, value) => sum + value, 0);
    const totalCount = counts.reduce((sum, value) => sum + value, 0);

    $("reportRevenue").textContent = formatRupiah(totalRevenue);
    $("reportOrders").textContent = totalCount;

    const context = $("salesChart").getContext("2d");

    if (salesChart) salesChart.destroy();

    salesChart = new Chart(context, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Pendapatan",
                data: values,
                backgroundColor: "rgba(183, 125, 136, 0.72)",
                borderColor: "#b77d88",
                borderWidth: 1,
                borderRadius: 8,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: context => formatRupiah(context.raw)
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => {
                            if (value >= 1000000) return "Rp" + (value / 1000000) + " jt";
                            if (value >= 1000) return "Rp" + (value / 1000) + " rb";
                            return "Rp" + value;
                        }
                    },
                    grid: { color: "#f3e9e7" }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

reportPeriod.addEventListener("change", updateSalesReport);


/* 16. STORE SETTINGS */

async function loadStoreSettings() {
    const { data, error } = await db
        .from("store_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error) {
        console.error("LOAD STORE SETTINGS ERROR:", error);
        showMessage(settingsMessage, "Gagal memuat pengaturan toko: " + error.message);
        return;
    }

    if (!data) return;

    $("storeName").value = data.store_name || "";
    $("storeWhatsapp").value = data.whatsapp || "";
    $("storeAddress").value = data.address || "";
    $("storeHours").value = data.opening_hours || "";
    $("storeInfo").value = data.info || "";
}

storeSettingsForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentOwner) return;

    clearMessage(settingsMessage);

    const settings = {
        store_name: $("storeName").value.trim(),
        whatsapp: $("storeWhatsapp").value.trim(),
        address: $("storeAddress").value.trim(),
        opening_hours: $("storeHours").value.trim(),
        info: $("storeInfo").value.trim(),
        updated_at: new Date().toISOString()
    };

    if (!settings.store_name) {
        showMessage(settingsMessage, "Nama toko wajib diisi.");
        return;
    }

    saveSettingsBtn.disabled = true;
    saveSettingsBtn.textContent = "Menyimpan...";

    try {
        const { error } = await db
            .from("store_settings")
            .update(settings)
            .eq("id", 1)
            .eq("owner_id", currentOwner.id);

        if (error) throw error;

        showMessage(settingsMessage, "Pengaturan toko berhasil disimpan!", "success");
    } catch (error) {
        console.error("SAVE SETTINGS ERROR:", error);
        showMessage(settingsMessage, "Gagal menyimpan pengaturan: " + error.message);
    } finally {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = "Simpan Pengaturan";
    }
});


/* 17. REALTIME NEW ORDER NOTIFICATION */

function playNotificationSound() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const audioContext = new AudioContextClass();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(1174, audioContext.currentTime + 0.15);

        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.15, audioContext.currentTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.4);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.42);

        oscillator.onended = () => audioContext.close();
    } catch (error) {
        console.warn("Audio notification tidak tersedia:", error);
    }
}

function notifyNewOrder(order) {
    unreadNotifications++;
    $("notificationCount").textContent = unreadNotifications;

    playNotificationSound();

    if (notificationEnabled && "Notification" in window &&
        Notification.permission === "granted") {
        new Notification("Pesanan Baru - Sweeté", {
            body: `${order.customer_name || "Pelanggan"} membuat pesanan ${order.order_code || ""}`,
            icon: ""
        });
    }

    alertNewOrder(order);
}

function alertNewOrder(order) {
    const toast = document.createElement("div");
    toast.className = "new-order-toast";
    toast.innerHTML = `
        <strong>Pesanan baru masuk!</strong>
        <span>${escapeHTML(order.customer_name || "Pelanggan")} · ${escapeHTML(order.order_code || "")}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 6000);
}

function subscribeToNewOrders() {
    if (realtimeChannel) {
        db.removeChannel(realtimeChannel);
    }

    knownOrderIds = new Set(currentOrders.map(order => String(order.id)));

    realtimeChannel = db
        .channel("owner-new-orders")
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "orders"
            },
            async payload => {
                const newOrder = payload.new;

                if (!newOrder || knownOrderIds.has(String(newOrder.id))) return;

                knownOrderIds.add(String(newOrder.id));
                notifyNewOrder(newOrder);

                await loadOrders();
                await loadProducts();
            }
        )
        .subscribe(status => {
            console.log("Realtime status:", status);
        });
}

$("notificationBtn").addEventListener("click", async () => {
    unreadNotifications = 0;
    $("notificationCount").textContent = "0";

    if (!("Notification" in window)) {
        notificationEnabled = true;
        alert("Notifikasi dalam dashboard diaktifkan. Izinkan suara melalui interaksi halaman.");
        playNotificationSound();
        return;
    }

    if (Notification.permission === "granted") {
        notificationEnabled = true;
        playNotificationSound();
        alert("Notifikasi browser sudah aktif.");
        return;
    }

    if (Notification.permission === "denied") {
        alert("Izin notifikasi browser ditolak. Ubah izin melalui pengaturan browser.");
        return;
    }

    notificationPermission = await Notification.requestPermission();
    notificationEnabled = notificationPermission === "granted";

    if (notificationEnabled) {
        playNotificationSound();
        alert("Notifikasi berhasil diaktifkan!");
    } else {
        alert("Izin notifikasi belum diberikan.");
    }
});


/* 18. SIDEBAR NAVIGATION */

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item =>
            item.classList.remove("active")
        );

        link.classList.add("active");
    });
});


/* 19. START APPLICATION */

initializeAuth();
