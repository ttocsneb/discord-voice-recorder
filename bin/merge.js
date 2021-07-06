var fs = require('fs');
var wav = require('./wav');

function join(root, ...paths) {
    let joined = root.replace('\\', '/');
    for (path of paths) {
        if (!joined.endsWith('/')) {
            joined += '/';
        }
        joined += path.replace('\\', '/');
    }
    return joined;
}

const recordings = join(__dirname, '../recordings/');

var percent = {};
var lastPercent = NaN;

function updateProgress(group, progress) {
    percent[group] = progress;
    let totalPercent = 0;
    for (let groupPercent of Object.values(percent)) {
        totalPercent += groupPercent;
    }
    totalPercent /= Object.values(percent).length;
    totalPercent = Math.floor(totalPercent * 100);
    if (totalPercent != lastPercent) {
        lastPercent = totalPercent;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        let bar = Math.round(totalPercent / 100 * 76);
        let num = totalPercent + "%";
        let progressBar = '='.repeat(bar) + ' '.repeat(76 - bar) + ' '.repeat(4 - num.length) + num;
        process.stdout.write(progressBar);
    }
}

function log(message) {
    lastPercent = NaN;
    console.log("\n" + message);
}

function mergeFolder(data, callback) {
    let outputStream = fs.createWriteStream(data.file);

    wav.waveBuild(data.chunks, outputStream, (progress) => {
        updateProgress(data.file, progress);
    }, () => {
        outputStream.end(callback);
    });
}

var folders = fs.readdirSync(recordings);

var stats = {};
var earliest = Infinity;

for (let folder of folders) {
    let path = join(recordings, folder);

    if (fs.statSync(path).isDirectory()) {
        stats[folder] = {};
        let chunks = fs.readdirSync(path);
        stats[folder].chunks = chunks;
        stats[folder].chunks.sort((a, b) => { return a - b});

        let time = Number(stats[folder].chunks[0].replace(".pcm", ''));
        earliest = Math.min(earliest, time);
    }
}

for (let [folder, data] of Object.entries(stats)) {
    let lastTime = earliest;
    let newChunks = [];
    data.size = 0;
    for (let chunk of data.chunks) {
        let file = join(recordings, folder, chunk);
        let time = Number(chunk.replace('.pcm', ''));
        let stat = wav.preprocess(time - lastTime, file);
        if (stat.size == 0) {
            fs.rmSync(file);
            continue;
        }
        data.size += stat.size;
        newChunks.push(stat);
        lastTime = time + stat.duration;
    }
    data.chunks = newChunks;
    data.file = join(recordings, `${folder}.wav`);
}

for (let [folder, data] of Object.entries(stats)) {
    console.log(`Processing ${folder}`);
    mergeFolder(data, () => {
        log(`Finished processing ${folder}`);
    });
}
