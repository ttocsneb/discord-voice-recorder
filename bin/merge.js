var fs = require('fs');

const recordings = __dirname + '../recordings/';

const silence = '\0\0\0\0'; // This is one sample of silence
const sampleRate = 48000;

function getRecordingLength(size) {
    return Math.round(size / 4) / sampleRate;
}

function generateSilence(first, last) {
    return silence.repeat(((last - first) / 1000.0) * 48000);
}

function join(dir, path) {
    if (dir.endsWith("/") || dir.endsWith("\\")) {
        return dir + path;
    }
    return dir + "/" + path;
}

function appendFiles(lastTime, dir, chunks, outputStream, onComplete) {
    if (!chunks.length) {
        onComplete();
        return;
    }

    let filename = chunks.shift();
    let currentFile = join(dir, filename);
    let time = Number(filename.replace(".pcm", ""));

    function pipe() {
        let inputStream = fs.createReadStream(currentFile);
        inputStream.pipe(outputStream, { end: false });
        inputStream.on('end', function() {
            let stat = fs.statSync(currentFile);
            let length = getRecordingLength(stat.size);
            appendFiles(time + length, dir, chunks, outputStream, onComplete);
        });
    }

    if (lastTime < time) {
        outputStream.write(generateSilence(lastTime, time), () => {
            pipe();
        });
    } else {
        pipe();
    }
}

function mergeFolder(earliest, path, output) {
    let chunks = fs.readdirSync(path)
    chunks.sort((a, b) => { return a - b});

    console.log("Merging to " + output);
    let outputStream = fs.createWriteStream(output);

    appendFiles(earliest, path, chunks, outputStream, () => {
        outputStream.end();
        console.log("Completed " + output);
    });
}

var folders = fs.readdirSync(recordings);

var earliest = NaN;

for (let folder of folders) {
    let path = join(recordings, folder);

    if (fs.statSync(path).isDirectory()) {
        let chunks = fs.readdirSync(path);
        for (let chunk of chunks) {
            let time = Number(chunk.replace(".pcm"));
            earliest = Math.min(earliest, time);
        }
    }
}

for (let folder of folders) {
    let path = join(recordings, folder);

    if (fs.statSync(path).isDirectory()) {
        console.log("Merging audio from " + folder);
        mergeFolder(earliest, path, join(recordings, folder + ".pcm"));
    }
}


