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
    silence = Math.max(0, silence);
    let stats = fs.statSync(pcmFile);
    let silentSamples = Math.round(silence / 1000) * samplesPerSec;
    let time = stats.size / (bytesPerSample * channels) / samplesPerSec * 1000;

    return {
        file: pcmFile,
        silence,
        size: 20 + stats.size,
        dataSize: silentSamples * bytesPerSample + stats.size,
        samples: silentSamples + stats.size / bytesPerSample,
        duration: Math.round(time)
    };
}

function appendPCM(data, outputPCMStream, callback) {
    function writePCM() {
        pipeFile(data.file, outputPCMStream, () => {
            fs.stat(data.file, (err, stats) => {
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
        });
    }

    if (data.silence > 0) {
        writeSilence(Math.round(data.silence / 1000) * samplesPerSec);
    } else {
        writePCM();
    }
}

exports.waveBuild = function(allData, outputStream, progressCb, callback) {
    let size = 0;
    for (let data of allData) {
        size += data.size;
    }
    let progress = 0;

    function writeData(index) {
        if (index >= allData.length) {
            callback();
            return
        }
        appendPCM(allData[index], outputStream, () => {
            progress += allData[index].size;
            progressCb(progress / size);
            writeData(index + 1);
        })
    }

    let wave = [...toBytes('WAVE'), ...waveFormat(), ...riff('data', size)]
    let header = [...riff('RIFF', size + wave.length), ...wave];
    outputStream.write(Buffer.from(header), () => {
        writeData(0);
    });
}
