const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const YTDlpWrap = require('yt-dlp-wrap').default;

// yt-dlp-wrap descarga yt-dlp automáticamente (no necesitas .exe)
const ytDlpWrap = new YTDlpWrap();

async function iniciarBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sesion');
    const sock = makeWASocket({ auth: state });

    sock.ev.on('connection.update', (update) => {
        if (update.qr) {
            console.log('¡Escaneá el QR!');
            qrcode.generate(update.qr, { small: true });
        }
        if (update.connection === 'open') console.log('¡Bot conectado y listo! 🚀');
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const chatId = msg.key.remoteJid;
        const textoOriginal = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const texto = textoOriginal.toLowerCase().trim();

        const responder = (txt) => sock.sendMessage(chatId, { text: txt }, { quoted: msg });

        if (texto.startsWith('.play ')) {
            const query = textoOriginal.slice(6).trim();
            if (!query) {
                responder('Uso: .play nombre canción');
                return;
            }

            responder(`Buscando "${query}"...`);

            try {
                const searchOutput = await ytDlpWrap.execPromise([
                    '--print', '%(id)s',
                    'ytsearch1:' + query
                ]);

                const videoId = searchOutput.trim();
                if (!videoId) {
                    responder('No encontré la canción.');
                    return;
                }

                const videoUrl = 'https://www.youtube.com/watch?v=' + videoId;

                const infoOutput = await ytDlpWrap.execPromise([
                    '--print', '%(title)s|||%(duration)s',
                    videoUrl
                ]);

                const [titulo, duracionStr] = infoOutput.trim().split('|||');
                const duracion = parseInt(duracionStr) || 0;

                if (duracion > 600) {
                    responder('Muy larga (máx 10 min).');
                    return;
                }

                responder(`Descargando: ${titulo}`);

                const tempFile = `temp_${Date.now()}.mp3`;

                await ytDlpWrap.execPromise([
                    videoUrl,
                    '-x',
                    '--audio-format', 'mp3',
                    '--audio-quality', '0',
                    '-o', tempFile
                ]);

                await sock.sendMessage(chatId, {
                    audio: { url: tempFile },
                    mimetype: 'audio/mpeg',
                    fileName: `${titulo.substring(0, 60)}.mp3`
                });

                responder('¡Audio enviado! 🎶');

            } catch (err) {
                console.log('Error .play:', err);
                responder('Error al descargar. Probá otra canción.');
            }
            return;
        }

        if (msg.key.fromMe) return;

        if (texto.includes('hola')) {
            responder('¡Hola! ¿En qué te ayudo?');
        } else if (texto === 'menu') {
            responder('.play nombre canción → audio MP3 🎶');
        }
    });
}

iniciarBot().catch(console.error);
