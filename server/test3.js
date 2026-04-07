import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function test() {
  const timestamp = Date.now();
  const tempInput = path.join(os.tmpdir(), `in_${timestamp}.webm`);
  const tempOutput = path.join(os.tmpdir(), `out_${timestamp}.ogg`);
  
  // create a real empty webm header or we use a dummy text file
  const buf = Buffer.from('1a45dfa3934282886d6174726f736b61', 'hex'); // basic mkv/webm magic bytes
  fs.writeFileSync(tempInput, buf);

  console.log("Ffmpeg path:", ffmpegInstaller.path);
  console.log("Input:", tempInput);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
          .audioCodec('libopus')
          .format('ogg')
          .on('end', resolve)
          .on('error', (err, stdout, stderr) => {
              console.error('Stderr:', stderr);
              reject(err);
          })
          .save(tempOutput);
    });
    console.log("Done");
  } catch (err) {
    console.error("Caught error:", err.message);
  }
}

test();
