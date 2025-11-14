// Dynamic progress update + Tracker
let recentTxns = []; // Global for tabs
async function updateProgressAndTracker() {
    const goal = 50000; // USD
    let totalUsd = 0;

    try {
        // BTC
        const btcAddr = 'bc1q036k7urq5pvjq29pep96ds4gftgmwycymnzs48';
        const btcRes = await fetch(`https://blockstream.info/api/address/${btcAddr}`);
        const btcData = await btcRes.json();
        const btcSat = (btcData.chain_stats.funded_txo_sum - btcData.chain_stats.spent_txo_sum);
        const btcBalance = btcSat / 100000000;

        // Recent BTC txs
        const btcTxsRes = await fetch(`https://blockstream.info/api/address/${btcAddr}/txs/chain`);
        const btcTxs = await btcTxsRes.json();
        btcTxs.slice(0, 5).forEach(tx => {
            if (tx.vin[0].prev_out?.addr === btcAddr) return; // Skip outgoing
            const value = (tx.vout.reduce((sum, v) => sum + (v.scriptpubkey_address === btcAddr ? v.value : 0), 0) / 100000000) * (prices.bitcoin?.usd || 60000);
            recentTxns.push({
                type: 'BTC',
                hash: tx.txid.slice(0, 10) + '...',
                value: value.toFixed(0),
                time: new Date(tx.status.block_time * 1000).toLocaleString(),
                link: `https://blockstream.info/tx/${tx.txid}`
            });
        });

        // ETH (balance)
        const ethAddr = '0xb8DDf6611c7A8a5D726B68F2A5F110BD2B839dAd';
        const rpcUrl = 'https://rpc.ankr.com/eth';
        const ethPayload = {
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [ethAddr, 'latest'],
            id: 1
        };
        const ethRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ethPayload)
        });
        const ethData = await ethRes.json();
        const ethWei = parseInt(ethData.result, 16);
        const ethBalance = ethWei / 1e18;

        // Recent ETH txs (Etherscan public)
        const ethTxsRes = await fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${ethAddr}&startblock=0&endblock=99999999&sort=desc&apikey=YourApiKeyToken`); // Rate-limited
        const ethTxsData = await ethTxsRes.json();
        if (ethTxsData.status === '1') {
            ethTxsData.result.slice(0, 5).forEach(tx => {
                const value = (parseInt(tx.value) / 1e18) * (prices.ethereum?.usd || 2500);
                if (parseInt(tx.value) > 0) {
                    recentTxns.push({
                        type: 'ETH',
                        hash: tx.hash.slice(0, 10) + '...',
                        value: value.toFixed(0),
                        time: new Date(tx.timeStamp * 1000).toLocaleString(),
                        link: `https://etherscan.io/tx/${tx.hash}`
                    });
                }
            });
        }

        // USDT on Tron
        const tronAddr = 'TWuspo2EFsdb551sVaXJjM7yZ3fGiP2UZ5';
        const tronTokensUrl = `https://apilist.tronscanapi.com/api/account/tokens?address=${tronAddr}`;
        const tronRes = await fetch(tronTokensUrl);
        const tronData = await tronRes.json();
        let usdtBalance = 0;
        if (tronData.data && tronData.data.length > 0) {
            for (let token of tronData.data) {
                if (token.tokenName === 'USDT' || token.symbol === 'USDT') {
                    usdtBalance = parseInt(token.balance) / 1e6;
                    break;
                }
            }
        }

        // Recent Tron txs
        const tronTxsUrl = `https://apilist.tronscanapi.com/api/transaction?sort=-timestamp&count=true&limit=5&start=0&address=${tronAddr}`;
        const tronTxsRes = await fetch(tronTxsUrl);
        const tronTxsData = await tronTxsRes.json();
        if (tronTxsData.data) {
            tronTxsData.data.forEach(tx => {
                if (tx.contract_address && tx.tokenInfo && tx.tokenInfo.symbol === 'USDT') {
                    const value = parseFloat(tx.amount || 0);
                    recentTxns.push({
                        type: 'USDT',
                        hash: tx.hash.slice(0, 10) + '...',
                        value: (value * (prices.tether?.usd || 1)).toFixed(0),
                        time: new Date(tx.timestamp / 1000).toLocaleString(),
                        link: `https://tronscan.org/#/transaction/${tx.hash}`
                    });
                }
            });
        }

        // Prices
        const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd');
        const prices = await cgRes.json();
        const btcUsd = prices.bitcoin?.usd || 60000;
        const ethUsd = prices.ethereum?.usd || 2500;
        const usdtUsd = prices.tether?.usd || 1;

        totalUsd = (btcBalance * btcUsd) + (ethBalance * ethUsd) + (usdtBalance * usdtUsd);
    } catch (error) {
        console.error('Error fetching balances/txns:', error);
        totalUsd = 0;
        recentTxns = [];
    }

    const percent = Math.min((totalUsd / goal) * 100, 100);
    document.getElementById('raised-amount').textContent = totalUsd.toFixed(0);
    document.getElementById('progress-percent').textContent = percent.toFixed(1);
    document.querySelector('.progress-fill').style.width = percent + '%';

    renderTrackerTable(recentTxns);
    updateMilestones(percent);
}

// Render table
function renderTrackerTable(txns) {
    const container = document.getElementById('tracker-table');
    if (txns.length === 0) {
        container.innerHTML = '<p>No recent donations yet—be the first! Check back after confirmations.</p>';
        return;
    }

    let html = '<table><thead><tr><th>Crypto</th><th>Amount (USD)</th><th>Tx Hash</th><th>Time</th><th>View</th></tr></thead><tbody>';
    txns.slice(0, 5).forEach(txn => {
        html += `<tr><td>${txn.type}</td><td>$${txn.value}</td><td>${txn.hash}</td><td>${txn.time}</td><td><a href="${txn.link}" target="_blank">Explorer</a></td></tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// Tabs
document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const tab = e.target.dataset.tab;
            // Filter logic here if needed
            renderTrackerTable(recentTxns.filter(t => tab === 'all' || t.type === tab.toUpperCase()));
        });
    });
    updateProgressAndTracker();
});

// Milestones with Notifications
const milestones = [
    { percent: 20, label: 'Emergency Hospital Bills Covered ($10k)', message: '🎉 Emergency Bills Covered! Thanks to you, James\'s hospital costs are secured. ❤️' },
    { percent: 40, label: 'First Therapy Sessions Funded ($20k)', message: '🎉 Therapy Sessions Start! Your donations mean James can begin his recovery journey. ❤️' },
    { percent: 60, label: 'Full Surgery Recovery Support ($30k)', message: '🎉 Surgery Support Unlocked! We\'ve got the funds for full post-op care. ❤️' },
    { percent: 80, label: 'Rehab Equipment Secured ($40k)', message: '🎉 Rehab Equipment Funded! James is one step closer to getting back on his feet. ❤️' },
    { percent: 100, label: 'Long-Term Care Fund Established ($50k)', message: '🎉 Goal Achieved! Long-term care is set—thank you for changing James\'s life. ❤️' }
];

function updateMilestones(currentPercent) {
    const milestoneEls = document.querySelectorAll('.milestone');
    let newUnlocks = [];

    milestoneEls.forEach((el, index) => {
        const targetPercent = parseInt(el.dataset.percent);
        const isUnlocked = currentPercent >= targetPercent;
        const seenKey = `milestone-${targetPercent}-seen`;

        if (isUnlocked) {
            el.dataset.unlocked = 'true';
            el.classList.add('unlocked');
            el.title = milestones[index].label;

            if (!localStorage.getItem(seenKey)) {
                newUnlocks.push(milestones[index].message);
                localStorage.setItem(seenKey, 'true');
            }
        } else {
            el.dataset.unlocked = 'false';
            el.classList.remove('unlocked');
            el.title = `Unlock at ${targetPercent}%: ${milestones[index].label}`;
        }
    });

    newUnlocks.forEach((message) => {
        const title = 'Milestone Unlocked for James!';
        showBrowserNotification(title, message, '/');
    });
}

// Simple Browser Notifications
let notificationPermission = Notification.permission;

function initNotifications() {
    if (notificationPermission === 'default') {
        const btn = document.getElementById('notify-btn');
        if (btn) btn.onclick = requestPermission;
    } else if (notificationPermission === 'granted') {
        const btn = document.getElementById('notify-btn');
        if (btn) {
            btn.textContent = 'Notifications Enabled! ❤️';
            btn.disabled = true;
        }
    }
}

async function requestPermission() {
    try {
        const perm = await Notification.requestPermission();
        notificationPermission = perm;
        if (perm === 'granted') {
            const btn = document.getElementById('notify-btn');
            if (btn) {
                btn.textContent = 'Notifications Enabled! ❤️';
                btn.disabled = true;
            }
            alert('Great! You\'ll get pings when we hit milestones for James.');
        } else {
            alert('No worries—check back often for updates!');
        }
    } catch (err) {
        console.error('Permission error:', err);
    }
}

function showBrowserNotification(title, body, url = window.location.href) {
    if (notificationPermission !== 'granted') return;

    const options = {
        body: body,
        icon: 'https://via.placeholder.com/192x192?text=James+Fund',
        badge: 'https://via.placeholder.com/32x32?text=JF',
        data: { url: url },
        tag: 'james-milestone',
        requireInteraction: false,
        actions: [{ action: 'view', title: 'View Site' }]
    };

    const notification = new Notification(title, options);

    notification.onclick = () => {
        window.focus();
        if (notification.data && notification.data.url) {
            window.open(notification.data.url, '_blank');
        }
        notification.close();
    };

    setTimeout(() => notification.close(), 5000);
}

document.addEventListener('DOMContentLoaded', initNotifications);

// Testimonials Carousel
let currentTestimonial = 0;
const testimonials = document.querySelectorAll('.testimonial');

function showTestimonial(index) {
    testimonials.forEach(t => t.classList.remove('active'));
    testimonials[index].classList.add('active');
}

function nextTestimonial() {
    currentTestimonial = (currentTestimonial + 1) % testimonials.length;
    showTestimonial(currentTestimonial);
}

function prevTestimonial() {
    currentTestimonial = (currentTestimonial - 1 + testimonials.length) % testimonials.length;
    showTestimonial(currentTestimonial);
}

setInterval(nextTestimonial, 5000);

document.addEventListener('DOMContentLoaded', () => {
    if (testimonials.length > 0) showTestimonial(0);
});

// Form submissions (demo)
const forms = document.querySelectorAll('form');
forms.forEach(form => {
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        alert('Thank you for your support! (Demo: Integrate with email/payment service for real submissions.)');
        this.reset();
    });
});

// Copy function
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Address copied! Paste into your wallet and send to support James. ❤️');
    });
}

// Generate QR codes (donate page only)
if (document.getElementById('qrcode-btc')) {
    document.addEventListener('DOMContentLoaded', function() {
        const addresses = {
            btc: 'bc1q036k7urq5pvjq29pep96ds4gftgmwycymnzs48',
            eth: 'ethereum:0xb8DDf6611c7A8a5D726B68F2A5F110BD2B839dAd',
            usdt: 'TWuspo2EFsdb551sVaXJjM7yZ3fGiP2UZ5'
        };

        QRCode.toCanvas(document.getElementById('qrcode-btc'), addresses.btc, { width: 128 });
        QRCode.toCanvas(document.getElementById('qrcode-eth'), addresses.eth, { width: 128 });
        QRCode.toCanvas(document.getElementById('qrcode-usdt'), addresses.usdt, { width: 128 });
    });
}

// Social Sharing
function shareToX() {
    const url = encodeURIComponent(window.location.origin + '/donate.html');
    const text = encodeURIComponent('Help James recover from his motorcycle accident—donate crypto now! ❤️ ' + url);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'width=550,height=400');
}

function shareToFacebook() {
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400');
}

function shareToLinkedIn() {
    const url = encodeURIComponent(window.location.origin);
    const title = encodeURIComponent('Support James\'s Recovery Fund');
    const summary = encodeURIComponent('James needs our help after a serious accident. Donate crypto to cover his bills!');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`, '_blank', 'width=600,height=400');
}

function shareToWhatsApp() {
    const url = encodeURIComponent(window.location.origin + '/donate.html');
    const text = encodeURIComponent('Help James recover from his motorcycle accident—donate crypto now! ❤️ ' + url);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
}

function shareToTelegram() {
    const url = encodeURIComponent(window.location.origin + '/donate.html');
    const text = encodeURIComponent('Help James recover from his motorcycle accident on November 14, 2025—donate crypto now! ❤️ ' + url);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
}

function shareViaEmail() {
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const subject = `Support James's Recovery Fund - Update on ${currentDate}`;
    const body = `James was in a serious motorcycle accident on November 13, 2025, and is recovering from surgery. Let's help cover his hospital bills and therapy—donate crypto here: ${window.location.origin}/donate.html

Your support means everything! ❤️

Forward this to friends who might want to contribute.

#JamesRecoveryFund`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Web Share API Fallback
if (navigator.share) {
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await navigator.share({
                    title: 'Support James\'s Recovery',
                    text: 'Help cover hospital bills after his accident—donate crypto! ❤️',
                    url: window.location.href
                });
            } catch (err) {
                // Fallback to platform
                if (btn.classList.contains('x')) shareToX();
                else if (btn.classList.contains('fb')) shareToFacebook();
                else if (btn.classList.contains('li')) shareToLinkedIn();
                else if (btn.classList.contains('whatsapp')) shareToWhatsApp();
                else if (btn.classList.contains('telegram')) shareToTelegram();
                else if (btn.classList.contains('email')) shareViaEmail();
            }
        });
    });
}
