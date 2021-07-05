var fs = require('fs');

const samplesPerSec = 48000;
const bytesPerSample = 2;
const channels = 2;
const sampleSize = bytesPerSample * channels;

function toChar(num) {
    return num & 255;
}

function toWord(num) {
    return [toChar(num), toChar(num >> 8)];
}

function toDWord(num) {
    return [...toWord(num), ...toWord(num >> 16)];
}

function toBytes(text) {
    let bytes = [];
    for (let i in text) {
        bytes.push(text.charCodeAt(i));
    }
    return bytes;
}

function repeat(arr, n) {
    let result = [];
    for (let i=0; i < n; i++) {
        result.push(...arr);
    }
    return result;
}

function riff(id, size) {
    return [...toBytes(id), ...toDWord(size)];
}

function waveFormat() {
    const wFormatTag = toWord(1);
    const nChannels = toWord(2);
    const nSamplesPerSec = toDWord(samplesPerSec);
    const nAvgBytesPerSec = toDWord(bytesPerSample * channels * samplesPerSec);
    const nBlockAlign = toWord(4);
    const nBitsPerSample = toWord(bytesPerSample * 8);

    return [...riff('fmt ', 16), ...wFormatTag, ...nChannels, ...nSamplesPerSec, ...nAvgBytesPerSec, ...nBlockAlign, ...nBitsPerSample];
}

function pipeFile(fileName, outputStream, callback) {
    let inputStream = fs.createReadStream(fileName);
    inputStream.pipe(outputStream, { end: false });
    inputStream.on('end', callback); 
}

exports.preprocess = function(silence, pcmFile) {
    let stats = fs.statSync(pcmFile);
    let silentSamples = Math.round(silence / 1000 * samplesPerSec);
    let time = stats.size / (bytesPerSample * channels) / samplesPerSec * 1000;

    return {
        size: silentSamples * sampleSize + stats.size,
        duration: Math.round(time)
    };
}

exports.appendPCM = function(silence, pcmFile, outputPCMStream, callback) {
    function writePCM() {
        pipeFile(pcmFile, outputPCMStream, () => {
            fs.stat(pcmFile, (err, stats) => {
                let time = stats.size / (bytesPerSample * channels) / samplesPerSec * 1000;
                callback(time);
            });
        });
    }

    function writeSilence(amount) {
        let val = Math.min(amount, 1000000);
        let buf = Buffer.alloc(val * sampleSize, 0);
        outputPCMStream.write(buf, () => {
            if (amount - val > 0) {
                writeSilence(amount - val);
            } else {
                writePCM();
            }
        })
    }

    if (silence > 0) {
        let silentSamples = Math.round(silence / 1000 * samplesPerSec);
        writeSilence(silentSamples);
    } else {
        writePCM();
    }
}

exports.waveBuild = function(size, outputStream, callback) {
    let wave = [...toBytes('WAVE'), ...waveFormat(), ...riff('data', size)]
    let header = [...riff('RIFF', size + wave.length), ...wave];

    outputStream.write(Buffer.from(header), callback);
}
