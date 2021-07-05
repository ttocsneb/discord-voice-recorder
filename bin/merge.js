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

var totalFiles = 0;
var processedFiles = 0;
var lastPercent = NaN;
var data = {};

function updateProgress() {
    processedFiles += 1;
    let progress = Math.floor(processedFiles / totalFiles * 100);
    if (progress != lastPercent) {
        lastPercent = progress;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        let bar = Math.round(progress / 100 * 76);
        let num = progress + "%";
        let progressBar = '='.repeat(bar) + ' '.repeat(76 - bar) + ' '.repeat(4 - num.length) + num;
        process.stdout.write(progressBar);
    }
}

function log(message) {
    lastPercent = NaN;
    console.log("\n" + message);
}

function appendFiles(lastTime, dir, chunks, outputStream, onComplete) {
    if (!chunks.length) {
        onComplete();
        return;
    }

    let filename = chunks.shift();
    let currentFile = join(dir, filename);
    let time = Number(filename.replace(".pcm", ""));

    wav.appendPCM(time - lastTime, currentFile, outputStream, (duration) => {
        updateProgress();
        appendFiles(time + duration, dir, chunks, outputStream, onComplete);
    });
}

function mergeFolder(data, callback) {
    let outputStream = fs.createWriteStream(data.file);

    function appendChunk(index) {
        if (index >= data.chunks.length) {
            outputStream.end(callback);
            return;
        }
        wav.appendPCM(data.chunks[index].silence, data.chunks[index].file, outputStream, () => {
            updateProgress();
            appendChunk(index + 1);
        });
    }
    wav.waveBuild(data.size, outputStream, () => {
        appendChunk(0);
    })
}

// function mergeFolder(earliest, path, output) {
//     let chunks = fs.readdirSync(path)
//     chunks.sort((a, b) => { return a - b});

//     console.log("Merging to " + output);
//     let tmpFile = output + '.pcm';
//     let tempStream = fs.createWriteStream(tmpFile);

//     appendFiles(earliest, path, chunks, tempStream, () => {
//         tempStream.end(() => {
//             wav.waveBuild(tmpFile, output, () => {
//                 fs.rm(tmpFile, () => {
//                     updateProgress();
//                     log("Completed " + output);
//                 });
//             });
//         });
//     });
// }

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
        totalFiles += chunks.length + 1;

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
        newChunks.push({
            file,
            silence: time - lastTime
        });
        lastTime = time + stat.duration;
    }
    data.chunks = newChunks;
    data.file = join(recordings, `${folder}.wav`);
}

for (let [folder, data] of Object.entries(stats)) {
    console.log(`Processing ${folder}`);
    mergeFolder(data, () => {
        updateProgress();
        log(`Finished processing ${folder}`);
    });
}

// for (let folder of folders) {
//     let path = join(recordings, folder);

//     if (fs.statSync(path).isDirectory()) {
//         mergeFolder(earliest, path, join(recordings, folder + ".wav"));
//     }
// }


