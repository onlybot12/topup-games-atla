const axios = require('axios');

/**
 * Fungsi untuk mengirim pesan WhatsApp via Gateway ngechat.com
 * @param {string} sesiId - Session ID dari dashboard gateway
 * @param {string} apikey - API Key dari dashboard gateway
 * @param {string} number - Nomor tujuan (format 628xxx)
 * @param {string} message - Isi pesan teks
 */
async function sendWag(sesiId, apikey, number, message) {
    try {
        // Pembersihan nomor (Hanya angka, ubah 08 ke 62)
        let cleanNumber = number.replace(/[^0-9]/g, '');
        if (cleanNumber.startsWith('0')) {
            cleanNumber = '62' + cleanNumber.slice(1);
        }

        const response = await axios.post(
            'https://ngechat.com/api/bot/send-message',
            {
                sessionId: sesiId,
                to: cleanNumber,
                message: message
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apikey,
                },
                timeout: 10000 // Timeout 10 detik agar tidak menghambat proses lain
            }
        );

        console.log(`✅ [WA NOTIF] Berhasil kirim ke ${cleanNumber}`);
        return response.data;
    } catch (error) {
        console.error('❌ [WA NOTIF] Error:', error.response ? error.response.data : error.message);
        return null;
    }
}

module.exports = sendWag;
