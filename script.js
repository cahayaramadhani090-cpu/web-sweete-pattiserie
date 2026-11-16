/* =========================================
   SWEETÉ PÂTISSERIE - CUSTOMER WEBSITE
========================================= */

/* 1. SUPABASE */
const SUPABASE_URL = "https://veylufvzfhdnyhqxtuba.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3FHzpnKJ_MUKIeNMg-WuBw_hzlss_rP";

const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

/* 2. GLOBAL DATA */
let products = [];
let activeCategory = "all";
let currentTrackingOrder = null;

let cart = JSON.parse(
    localStorage.getItem("sweete-cart") || "[]"
);

/* 3. HELPERS */
const rupiah = value => new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
}).format(Number(value) || 0);

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function safeImageURL(value) {
    try {
        const url = new URL(value);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
}

function normalizePhone(phone) {
    return String(phone || "").replace(/\D/g, "").replace(/^0/, "62");
}

function formatDate(value) {
    if (!value) return "-";

    return new Date(value).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(window.sweeteToastTimer);

    window.sweeteToastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2600);
}

/* 4. ELEMENTS */
const productGrid = document.getElementById("productGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("searchInput");

const cartDrawer = document.getElementById("cartDrawer");
const overlay = document.getElementById("overlay");
const cartItems = document.getElementById("cartItems");
const cartEmpty = document.getElementById("cartEmpty");
const cartFooter = document.getElementById("cartFooter");

const checkoutModal = document.getElementById("checkoutModal");
const detailModal = document.getElementById("detailModal");
const reviewModal = document.getElementById("reviewModal");

/* 5. LOAD PRODUCTS */
async function loadProducts() {
    productGrid.innerHTML = `
        <p class="empty-state">Memuat menu Sweeté Pâtisserie...</p>
    `;

    try {
        const { data, error } = await db
            .from("products")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        products = (data || [])
            .filter(product =>
                product.is_archived !== true &&
                product.is_available !== false
            );

        // Sinkronkan keranjang dengan produk yang masih tersedia.
        cart = cart.filter(item =>
            products.some(product =>
                String(product.id) === String(item.id)
            )
        );

        saveCart();
        renderProducts();
    } catch (error) {
        console.error("Gagal memuat produk:", error);

        productGrid.innerHTML = `
            <p class="empty-state">
                Gagal memuat menu. Silakan coba muat ulang halaman.
            </p>
        `;
    }
}

/* 6. PRODUCT DISPLAY */
function renderProducts() {
    const keyword = searchInput.value.trim().toLowerCase();

    const filtered = products.filter(product => {
        const category = String(product.category || "").toLowerCase();

        const matchesCategory =
            activeCategory === "all" ||
            category === activeCategory;

        const matchesSearch = [
            product.name,
            product.description,
            product.category,
            product.tag
        ].join(" ").toLowerCase().includes(keyword);

        return matchesCategory && matchesSearch;
    });

    const categoryNames = {
        cake: "Kue",
        pastry: "Pastry",
        cookies: "Cookies",
        dessert: "Dessert"
    };

    productGrid.innerHTML = filtered.map(product => {
        const imageURL = safeImageURL(product.image);

        return `
            <article class="product-card">
                <div class="product-image-wrap">
                    ${
                        imageURL
                            ? `<img class="product-image"
                                src="${escapeHTML(imageURL)}"
                                alt="${escapeHTML(product.name)}"
                                loading="lazy">`
                            : `<div class="product-image product-placeholder">Sweeté</div>`
                    }

                    ${product.tag ? `
                        <span class="product-tag">${escapeHTML(product.tag)}</span>
                    ` : ""}

                    <button class="add-button"
                        data-add="${escapeHTML(product.id)}"
                        aria-label="Tambah ke keranjang">+</button>
                </div>

                <div class="product-info">
                    <p class="product-category">
                        ${escapeHTML(categoryNames[String(product.category || "").toLowerCase()] || product.category || "Sweeté")}
                    </p>

                    <div class="product-name-row">
                        <h3 class="product-name">${escapeHTML(product.name)}</h3>
                        <span class="product-price">${rupiah(product.price)}</span>
                    </div>

                    <p class="product-desc">
                        ${escapeHTML(product.description || "Dibuat dengan penuh cinta oleh Sweeté.")}
                    </p>

                    <button class="detail-link" data-detail="${escapeHTML(product.id)}">
                        Lihat detail produk ↗
                    </button>
                </div>
            </article>
        `;
    }).join("");

    emptyState.classList.toggle("hidden", filtered.length > 0);
}

/* 7. PRODUCT DETAIL */
function openProductDetail(id) {
    const product = products.find(item =>
        String(item.id) === String(id)
    );

    if (!product) return;

    const imageURL = safeImageURL(product.image);

    const categoryNames = {
        cake: "Cakes",
        pastry: "Pastries",
        cookies: "Cookies",
        dessert: "Desserts"
    };

    document.getElementById("productDetailContent").innerHTML = `
        <div class="detail-layout">
            <div class="detail-image-wrap">
                ${
                    imageURL
                        ? `<img src="${escapeHTML(imageURL)}" alt="${escapeHTML(product.name)}">`
                        : `<div class="product-placeholder">Sweeté</div>`
                }
            </div>

            <div class="detail-information">
                <p class="eyebrow">SWEETÉ PRODUCT COLLECTION</p>
                <p class="detail-category">
                    ${escapeHTML(categoryNames[String(product.category || "").toLowerCase()] || product.category || "Sweeté")}
                </p>

                <h2>${escapeHTML(product.name)}</h2>
                <p class="detail-price">${rupiah(product.price)}</p>

                <div class="detail-divider"></div>

                <h4>Deskripsi Produk</h4>
                <p class="detail-description">
                    ${escapeHTML(product.description || "Produk pilihan Sweeté yang dibuat dengan penuh cinta.")}
                </p>

                <div class="detail-meta">
                    <div>
                        <span>Kategori</span>
                        <strong>${escapeHTML(categoryNames[String(product.category || "").toLowerCase()] || product.category || "-")}</strong>
                    </div>
                    <div>
                        <span>Ketersediaan</span>
                        <strong>${Number(product.stock) > 0 ? `Tersedia (${Number(product.stock)} stok)` : "Stok habis"}</strong>
                    </div>
                    <div>
                        <span>Label</span>
                        <strong>${escapeHTML(product.tag || "Sweeté Favorite")}</strong>
                    </div>
                </div>

                <button class="button button-dark detail-add-button"
                    data-detail-add="${escapeHTML(product.id)}"
                    ${Number(product.stock) <= 0 ? "disabled" : ""}>
                    Tambahkan ke Keranjang <span>♡</span>
                </button>
            </div>
        </div>
    `;

    detailModal.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeProductDetail() {
    detailModal.classList.remove("open");
    document.body.style.overflow = "";
}

/* 8. CART */
function saveCart() {
    localStorage.setItem("sweete-cart", JSON.stringify(cart));
    renderCart();
}

function addToCart(id) {
    const product = products.find(item =>
        String(item.id) === String(id)
    );

    if (!product) {
        showToast("Produk tidak tersedia.");
        return;
    }

    const stock = Number(product.stock) || 0;

    if (stock <= 0) {
        showToast("Maaf, stok produk sedang habis.");
        return;
    }

    const found = cart.find(item =>
        String(item.id) === String(id)
    );

    const currentQty = found ? Number(found.qty) : 0;

    if (currentQty >= stock) {
        showToast(`Stok hanya tersedia ${stock} buah.`);
        return;
    }

    if (found) {
        found.qty += 1;
    } else {
        cart.push({
            id: product.id,
            qty: 1
        });
    }

    saveCart();
    showToast("Produk berhasil ditambahkan ke keranjang ♡");
}

function changeQty(id, amount) {
    const item = cart.find(entry =>
        String(entry.id) === String(id)
    );

    if (!item) return;

    const product = products.find(p =>
        String(p.id) === String(id)
    );

    if (!product) return;

    const newQty = Number(item.qty) + amount;
    const stock = Number(product.stock) || 0;

    if (newQty > stock) {
        showToast(`Stok hanya tersedia ${stock} buah.`);
        return;
    }

    if (newQty <= 0) {
        cart = cart.filter(entry =>
            String(entry.id) !== String(id)
        );
    } else {
        item.qty = newQty;
    }

    saveCart();
}

function removeFromCart(id) {
    cart = cart.filter(item =>
        String(item.id) !== String(id)
    );

    saveCart();
    showToast("Produk dihapus dari keranjang.");
}

function getCartSubtotal() {
    return cart.reduce((sum, item) => {
        const product = products.find(p =>
            String(p.id) === String(item.id)
        );

        return sum + (
            product
                ? Number(product.price) * Number(item.qty)
                : 0
        );
    }, 0);
}

function renderCart() {
    const count = cart.reduce((sum, item) =>
        sum + Number(item.qty), 0
    );

    const subtotal = getCartSubtotal();

    document.getElementById("cartCount").textContent = count;
    document.getElementById("drawerCount").textContent = count;
    document.getElementById("subtotal").textContent = rupiah(subtotal);
    document.getElementById("checkoutTotal").textContent = rupiah(subtotal);

    cartEmpty.classList.toggle("hidden", count > 0);
    cartFooter.classList.toggle("hidden", count === 0);

    cartItems.innerHTML = cart.map(item => {
        const product = products.find(p =>
            String(p.id) === String(item.id)
        );

        if (!product) return "";

        const imageURL = safeImageURL(product.image);

        return `
            <div class="cart-row">
                ${
                    imageURL
                        ? `<img src="${escapeHTML(imageURL)}" alt="${escapeHTML(product.name)}">`
                        : `<div class="cart-placeholder">s.</div>`
                }

                <div class="cart-row-info">
                    <h3>${escapeHTML(product.name)}</h3>
                    <span class="item-price">${rupiah(product.price)}</span>

                    <div class="quantity-control">
                        <button data-qty="${escapeHTML(product.id)}" data-change="-1">−</button>
                        <span>${Number(item.qty)}</span>
                        <button data-qty="${escapeHTML(product.id)}" data-change="1">+</button>
                    </div>
                </div>

                <button class="remove-item"
                    data-remove="${escapeHTML(product.id)}"
                    aria-label="Hapus produk">×</button>
            </div>
        `;
    }).join("");
}

function openCart() {
    cartDrawer.classList.add("open");
    overlay.classList.add("show");
    cartDrawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeCart() {
    cartDrawer.classList.remove("open");
    overlay.classList.remove("show");
    cartDrawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

/* 9. CHECKOUT */
function openCheckout() {
    if (!cart.length) return;

    closeCart();
    checkoutModal.classList.add("open");
    checkoutModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeCheckout() {
    checkoutModal.classList.remove("open");
    checkoutModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

const deliveryDate = document.getElementById("deliveryDate");
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const localDate = new Date(
    tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000
).toISOString().split("T")[0];

deliveryDate.min = localDate;

/* Checkout tetap menggunakan RPC yang sudah dipakai project sebelumnya. */
document.getElementById("checkoutForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!cart.length) return;

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);

    submitButton.disabled = true;
    submitButton.textContent = "Menyimpan pesanan...";

    try {
        const { data, error: productError } = await db
            .from("products")
            .select("id, name, price, stock, is_available, is_archived");

        if (productError) throw productError;

        const latestProducts = data || [];

        for (const item of cart) {
            const product = latestProducts.find(p =>
                String(p.id) === String(item.id)
            );

            if (
                !product ||
                product.is_archived === true ||
                product.is_available === false
            ) {
                throw new Error("Ada produk yang sudah tidak tersedia.");
            }

            if (Number(product.stock) < Number(item.qty)) {
                throw new Error(`Stok ${product.name} tidak mencukupi.`);
            }
        }

        const orderCode = "SWT-" + Date.now().toString().slice(-6);

        const orderPayload = {
            order_code: orderCode,
            customer_name: formData.get("name"),
            customer_phone: formData.get("phone"),
            delivery_address: formData.get("address"),
            delivery_date: formData.get("date"),
            payment_method: formData.get("payment"),
            note: formData.get("note") || "",
            shipping_fee: 0,
            cart: cart.map(item => ({
                id: String(item.id),
                qty: Number(item.qty)
            }))
        };

        const { data: orderResult, error } = await db.rpc(
            "create_order_with_stock",
            { p_order: orderPayload }
        );

        if (error) throw error;

        if (!orderResult || orderResult.success !== true) {
            throw new Error(
                orderResult?.message || "Pesanan gagal diproses."
            );
        }

        // Simpan informasi agar pelanggan mudah melacak pesanan.
        const savedOrder = {
            ...orderResult,
            order_code: orderResult.order_code || orderCode,
            customer_phone: formData.get("phone")
        };

        localStorage.setItem(
            "sweete-last-order",
            JSON.stringify(savedOrder)
        );

        cart = [];
        saveCart();

        form.reset();
        closeCheckout();

        showToast("Pesanan berhasil dibuat ♡");

        // Isi form pelacakan dengan data pesanan terakhir.
        document.getElementById("trackingCode").value =
            savedOrder.order_code;

        document.getElementById("trackingPhone").value =
            savedOrder.customer_phone;

        setTimeout(() => {
            alert(
                "PESANAN BERHASIL DIBUAT ♡\n\n" +
                "Kode Pesanan: " + savedOrder.order_code + "\n\n" +
                "Total: " + rupiah(orderResult.total) + "\n\n" +
                "Simpan kode pesanan untuk melacak pesananmu."
            );
        }, 250);

    } catch (error) {
        console.error("Checkout error:", error);
        showToast(error.message || "Pesanan gagal disimpan.");
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Buat Pesanan <span>♡</span>';
    }
});

/* 10. ORDER TRACKING */
const statusSteps = [
    {
        key: "menunggu konfirmasi",
        title: "Menunggu Konfirmasi",
        description: "Pesananmu sedang menunggu konfirmasi dari toko."
    },
    {
        key: "diproses",
        title: "Diproses",
        description: "Pesananmu sedang disiapkan oleh tim Sweeté."
    },
    {
        key: "sedang dikirim",
        title: "Sedang Dikirim",
        description: "Pesananmu sedang dalam perjalanan."
    },
    {
        key: "selesai",
        title: "Selesai",
        description: "Pesanan telah selesai. Terima kasih sudah memilih Sweeté!"
    }
];

function normalizeStatus(status) {
    const value = String(status || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/-/g, " ");

    if (["pending", "menunggu", "menunggu konfirmasi", "waiting"].includes(value)) {
        return "menunggu konfirmasi";
    }

    if (["processing", "diproses", "processed"].includes(value)) {
        return "diproses";
    }

    if (["shipping", "shipped", "dikirim", "sedang dikirim", "on delivery"].includes(value)) {
        return "sedang dikirim";
    }

    if (["completed", "complete", "selesai", "done"].includes(value)) {
        return "selesai";
    }

    return value;
}

function renderTracking(order) {
    const result = document.getElementById("trackingResult");
    const normalized = normalizeStatus(order.status);

    const activeIndex = statusSteps.findIndex(step =>
        step.key === normalized
    );

    const displayIndex = activeIndex >= 0 ? activeIndex : 0;

    const progressHTML = statusSteps.map((step, index) => `
        <div class="tracking-step ${index <= displayIndex ? "completed" : ""} ${index === displayIndex ? "current" : ""}">
            <div class="tracking-step-icon">
                ${index < displayIndex ? "✓" : index + 1}
            </div>
            <div class="tracking-step-text">
                <strong>${step.title}</strong>
                <span>${step.description}</span>
            </div>
        </div>
    `).join("");

    const orderItems = Array.isArray(order.items)
        ? order.items
        : typeof order.items === "string"
            ? (() => {
                try {
                    const parsed = JSON.parse(order.items);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
            : [];

    const itemsHTML = orderItems.length
        ? orderItems.map(item => `
            <div class="tracking-item">
                <span>${escapeHTML(item.name || item.product_name || "Produk")} × ${Number(item.qty || item.quantity || 1)}</span>
                <strong>${item.price ? rupiah(Number(item.price) * Number(item.qty || item.quantity || 1)) : ""}</strong>
            </div>
        `).join("")
        : `<p class="tracking-muted">Rincian produk tidak tersedia.</p>`;

    result.innerHTML = `
        <div class="tracking-order-header">
            <div>
                <span class="tracking-muted">KODE PESANAN</span>
                <h3>${escapeHTML(order.order_code)}</h3>
            </div>
            <span class="status-badge">${escapeHTML(order.status || "Menunggu Konfirmasi")}</span>
        </div>

        <div class="tracking-progress">
            ${progressHTML}
        </div>

        <div class="tracking-order-details">
            <h4>Informasi Pesanan</h4>
            <div><span>Nama pelanggan</span><strong>${escapeHTML(order.customer_name)}</strong></div>
            <div><span>Tanggal pengiriman</span><strong>${formatDate(order.delivery_date)}</strong></div>
            <div><span>Metode pembayaran</span><strong>${escapeHTML(order.payment_method || "-")}</strong></div>
            <div><span>Alamat</span><strong>${escapeHTML(order.delivery_address || "-")}</strong></div>
        </div>

        <div class="tracking-order-details">
            <h4>Rincian Produk</h4>
            ${itemsHTML}
            <div><span>Subtotal</span><strong>${rupiah(order.subtotal)}</strong></div>
            <div><span>Pengiriman</span><strong>${rupiah(order.shipping_fee)}</strong></div>
            <div class="tracking-total"><span>Total</span><strong>${rupiah(order.total)}</strong></div>
        </div>

        ${
            normalized === "selesai"
                ? `<div class="review-invitation">
                    <h4>Pesanan sudah sampai! ♡</h4>
                    <p>Yuk, bagikan pengalamanmu dengan produk Sweeté.</p>
                    <button class="button button-dark" id="startReviewButton">
                        Tulis Ulasan <span>↗</span>
                    </button>
                </div>`
                : ""
        }
    `;

    result.classList.remove("hidden");

    const reviewButton = document.getElementById("startReviewButton");

    if (reviewButton) {
        reviewButton.addEventListener("click", () => {
            openReviewForOrder(order);
        });
    }
}

document.getElementById("trackingForm").addEventListener("submit", async event => {
    event.preventDefault();

    const code = document.getElementById("trackingCode").value.trim();
    const phone = document.getElementById("trackingPhone").value.trim();
    const button = document.getElementById("trackingButton");
    const result = document.getElementById("trackingResult");

    button.disabled = true;
    button.textContent = "Mencari pesanan...";
    result.classList.add("hidden");

    try {
        const { data, error } = await db
            .from("orders")
            .select("*")
            .eq("order_code", code)
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            throw new Error("Pesanan tidak ditemukan. Periksa kembali kode pesananmu.");
        }

        if (
            normalizePhone(data.customer_phone) !== normalizePhone(phone)
        ) {
            throw new Error("Nomor WhatsApp tidak sesuai dengan data pesanan.");
        }

        currentTrackingOrder = data;
        renderTracking(data);

    } catch (error) {
        console.error("Tracking error:", error);

        result.innerHTML = `
            <div class="tracking-error">
                <strong>Pesanan belum ditemukan</strong>
                <p>${escapeHTML(error.message || "Terjadi kesalahan saat mencari pesanan.")}</p>
            </div>
        `;

        result.classList.remove("hidden");
    } finally {
        button.disabled = false;
        button.innerHTML = 'Lacak Pesanan <span>↗</span>';
    }
});

/* 11. REVIEWS */
async function loadReviews() {
    const grid = document.getElementById("reviewsGrid");

    try {
        const { data, error } = await db
            .from("reviews")
            .select("id, product_id, customer_name, rating, comment, created_at")
            .order("created_at", { ascending: false })
            .limit(12);

        if (error) throw error;

        if (!data || data.length === 0) {
            grid.innerHTML = `
                <p class="empty-state">
                    Belum ada ulasan. Jadilah pelanggan pertama yang berbagi cerita manis!
                </p>
            `;
            return;
        }

        grid.innerHTML = data.map(review => {
            const product = products.find(item =>
                String(item.id) === String(review.product_id)
            );

            const rating = Math.min(5, Math.max(0, Number(review.rating) || 0));
            const stars = "★".repeat(rating) + "☆".repeat(5 - rating);

            return `
                <article class="review-card">
                    <div class="review-stars">${stars}</div>
                    <p class="review-comment">“${escapeHTML(review.comment)}”</p>
                    <div class="review-author">
                        <strong>${escapeHTML(review.customer_name)}</strong>
                        <span>${escapeHTML(product?.name || "Pelanggan Sweeté")}</span>
                    </div>
                    <small>${formatDate(review.created_at)}</small>
                </article>
            `;
        }).join("");

    } catch (error) {
        console.error("Gagal memuat ulasan:", error);

        grid.innerHTML = `
            <p class="empty-state">Ulasan belum dapat dimuat.</p>
        `;
    }
}

async function openReviewForOrder(order) {
    if (normalizeStatus(order.status) !== "selesai") {
        showToast("Ulasan hanya tersedia setelah pesanan selesai.");
        return;
    }

    const items = Array.isArray(order.items)
        ? order.items
        : typeof order.items === "string"
            ? (() => {
                try {
                    const parsed = JSON.parse(order.items);
                    return Array.isArray(parsed) ? parsed : [];
                } catch {
                    return [];
                }
            })()
            : [];

    if (!items.length) {
        showToast("Rincian produk pada pesanan tidak ditemukan.");
        return;
    }

    // Pilih produk yang belum pernah diberi ulasan untuk pesanan ini.
    const { data: existingReviews, error } = await db
        .from("reviews")
        .select("product_id")
        .eq("order_id", order.id);

    if (error) {
        console.error(error);
        showToast("Tidak dapat memeriksa ulasan pesanan.");
        return;
    }

    const reviewedIds = (existingReviews || []).map(review =>
        String(review.product_id)
    );

    const reviewableItems = items.filter(item => {
        const id = item.id ?? item.product_id;
        return id && !reviewedIds.includes(String(id));
    });

    if (!reviewableItems.length) {
        showToast("Semua produk pada pesanan ini sudah kamu ulas. Terima kasih!");
        return;
    }

    const item = reviewableItems[0];
    const productId = item.id ?? item.product_id;
    const product = products.find(p =>
        String(p.id) === String(productId)
    );

    document.getElementById("reviewOrderId").value = order.id;
    document.getElementById("reviewProductId").value = productId;
    document.getElementById("reviewCustomerName").value = order.customer_name || "";
    document.getElementById("reviewProductName").textContent =
        `Ulasan untuk: ${product?.name || item.name || item.product_name || "Produk Sweeté"}`;

    reviewModal.classList.add("open");
    reviewModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeReview() {
    reviewModal.classList.remove("open");
    reviewModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

document.getElementById("reviewForm").addEventListener("submit", async event => {
    event.preventDefault();

    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Mengirim ulasan...";

    try {
        const orderId = document.getElementById("reviewOrderId").value;
        const productId = document.getElementById("reviewProductId").value;

        // Validasi ulang status pesanan dari database.
        const { data: order, error: orderError } = await db
            .from("orders")
            .select("id, status")
            .eq("id", orderId)
            .maybeSingle();

        if (orderError) throw orderError;

        if (!order || normalizeStatus(order.status) !== "selesai") {
            throw new Error("Ulasan hanya dapat dikirim untuk pesanan yang sudah selesai.");
        }

        const reviewData = {
            order_id: orderId,
            product_id: productId,
            customer_name: document.getElementById("reviewCustomerName").value.trim(),
            rating: Number(document.getElementById("reviewRating").value),
            comment: document.getElementById("reviewComment").value.trim()
        };

        const { error } = await db
            .from("reviews")
            .insert(reviewData);

        if (error) {
            if (error.code === "23505") {
                throw new Error("Produk ini sudah pernah kamu ulas untuk pesanan tersebut.");
            }

            throw error;
        }

        closeReview();
        event.currentTarget.reset();

        showToast("Terima kasih sudah memberikan ulasan ♡");
        await loadReviews();

    } catch (error) {
        console.error("Review error:", error);
        showToast(error.message || "Ulasan gagal dikirim.");
    } finally {
        button.disabled = false;
        button.innerHTML = 'Kirim Ulasan <span>♡</span>';
    }
});

/* 12. STORE SETTINGS */
async function loadStoreSettings() {
    try {
        const { data, error } = await db
            .from("store_settings")
            .select("store_name, whatsapp, address, opening_hours, info")
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (!data) return;

        const storeName = data.store_name || "Sweeté Pâtisserie";
        const phone = String(data.whatsapp || "").replace(/\D/g, "");

        document.getElementById("storeInformation").innerHTML = `
            <span>${escapeHTML(storeName)}</span>
            ${data.address ? `<span>${escapeHTML(data.address)}</span>` : ""}
            ${data.opening_hours ? `<span>Jam operasional: ${escapeHTML(data.opening_hours)}</span>` : ""}
            ${data.info ? `<span>${escapeHTML(data.info)}</span>` : ""}
        `;

        const whatsappButton = document.getElementById("whatsappButton");

        if (phone) {
            const message = encodeURIComponent(
                `Halo ${storeName}, saya ingin bertanya mengenai produk Sweeté.`
            );

            whatsappButton.href =
                `https://wa.me/${phone}?text=${message}`;

            whatsappButton.classList.remove("hidden");
        } else {
            whatsappButton.classList.add("hidden");
        }

    } catch (error) {
        console.error("Gagal memuat informasi toko:", error);
        document.getElementById("whatsappButton").classList.add("hidden");
    }
}

/* 13. CATEGORY FILTER */
document.getElementById("filters").addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    activeCategory = button.dataset.category;

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.toggle("active", btn === button);
    });

    renderProducts();
});

/* 14. SEARCH */
searchInput.addEventListener("input", renderProducts);

/* 15. PRODUCT BUTTON EVENTS */
productGrid.addEventListener("click", event => {
    const addButton = event.target.closest("[data-add]");
    const detailButton = event.target.closest("[data-detail]");

    if (addButton) {
        addToCart(addButton.dataset.add);
        return;
    }

    if (detailButton) {
        openProductDetail(detailButton.dataset.detail);
    }
});

document.getElementById("productDetailContent").addEventListener("click", event => {
    const button = event.target.closest("[data-detail-add]");
    if (!button) return;

    addToCart(button.dataset.detailAdd);
    closeProductDetail();
});

/* 16. CART EVENTS */
cartItems.addEventListener("click", event => {
    const qtyButton = event.target.closest("[data-qty]");
    const removeButton = event.target.closest("[data-remove]");

    if (qtyButton) {
        changeQty(
            qtyButton.dataset.qty,
            Number(qtyButton.dataset.change)
        );
    }

    if (removeButton) {
        removeFromCart(removeButton.dataset.remove);
    }
});

/* 17. BUTTON EVENTS */
document.getElementById("openCart").addEventListener("click", openCart);
document.getElementById("closeCart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);

document.getElementById("continueShopping").addEventListener("click", closeCart);
document.getElementById("checkoutButton").addEventListener("click", openCheckout);

checkoutModal.querySelectorAll("[data-close-checkout]").forEach(element => {
    element.addEventListener("click", closeCheckout);
});

detailModal.querySelectorAll("[data-close-detail]").forEach(element => {
    element.addEventListener("click", closeProductDetail);
});

reviewModal.querySelectorAll("[data-close-review]").forEach(element => {
    element.addEventListener("click", closeReview);
});

/* 18. NEWSLETTER */
document.getElementById("newsletterForm").addEventListener("submit", event => {
    event.preventDefault();

    const email = document.getElementById("newsletterEmail").value.trim();

    showToast(`Terima kasih! ${email} berhasil didaftarkan ♡`);
    event.currentTarget.reset();
});

/* 19. MOBILE MENU */
document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("mainNav").classList.toggle("open");
});

document.querySelectorAll(".main-nav a").forEach(link => {
    link.addEventListener("click", () => {
        document.getElementById("mainNav").classList.remove("open");
    });
});

/* 20. ESCAPE KEY */
document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closeCart();
        closeCheckout();
        closeProductDetail();
        closeReview();
    }
});

/* 21. INITIALIZE */
async function initializeWebsite() {
    renderCart();

    await Promise.all([
        loadProducts(),
        loadStoreSettings()
    ]);

    await loadReviews();
}

initializeWebsite();