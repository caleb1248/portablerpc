import { build } from 'esbuild';
import { exec } from 'child_process';
import { relative, dirname, basename, sep, join } from 'path';
import chalk from 'chalk';
import { promises } from 'fs';
import { fileURLToPath } from 'url';

const distDir = join(dirname(fileURLToPath(import.meta.url)), 'dist');

const { bold, grey, blue } = chalk;

const skip_types = process.argv.includes('--skip-types');
const minify = process.argv.includes('--minify');

const error = bold.red;
const warning = bold.yellow;
const success = bold.green;
const boldBlue = bold.blue;
const orange = bold.hex('#FFA500');

const packageName = 'PortableRpc'; // Replace this with a export name for iife support. Should be a string.

const buildSizeLogs = [];

async function doEsbuild(format) {
  const outdir = join(distDir, format.toLowerCase());
  console.log(boldBlue(`Building ${format}...`));

  if (format === 'iife' && typeof packageName !== 'string') {
    console.warn(
      warning(
        'Package name is required for iife. Please modify packageName to build iife.'
      )
    );
    return;
  }

  const config = {
    entryPoints: ['./src/index.ts'],
    sourcemap: true,
    bundle: true,
    target: 'es6',
    format: format.toLowerCase(),
    minify: minify,
    write: false,
    outdir: outdir,
    globalName: format === 'iife' ? packageName : undefined,
  };

  try {
    promises.mkdir(outdir, { recursive: true });
    const result = await build(config);

    for (const output of result.outputFiles) {
      const relativePath = relative(process.cwd(), output.path);
      const dirPath = dirname(relativePath);
      const fileName = basename(relativePath);
      const sizeInKB = (output.contents.length / 1024).toFixed(2);

      buildSizeLogs.push(
        `  ${grey(dirPath + sep)}${blue(fileName)} - ${orange(
          sizeInKB + ' KB'
        )}`
      );

      await promises.writeFile(output.path, output.contents);
    }

    console.log(success(`Format ${format} built successfully.\n`));
  } catch (e) {
    console.log(e);
    console.error(error(`${format} build failed.`));
    throw new Error(`\n\n${e.message}`);
  }
}

function generateTypes() {
  return new Promise((resolve, reject) => {
    console.log(boldBlue('Generating types...'));
    exec('npx tsc', (err, stdout, stderr) => {
      if (err) {
        console.error(error(`Type generation failed:`, stdout));
        reject(new Error(stdout));
      } else {
        console.log(success('Type generation successful\n'));
        resolve();
      }
    }).stdout.pipe(process.stderr);
  });
}

async function buildAllFormats() {
  // if (existsSync(distDir))
  //   await promises.rm(distDir, { recursive: true, force: true });

  const formats = ['ESM', 'CJS', 'iife'];

  if (!skip_types) await generateTypes();

  for (const format of formats) {
    await doEsbuild(format);
  }

  console.log(
    Array.from({ length: process.stdout.columns }).fill('―').join('')
  );
  console.log(success(`\nThe build succeeded.\n`));

  buildSizeLogs.forEach((log) => console.log(log));
}

buildAllFormats().catch((e) => {
  console.log(
    Array.from({ length: process.stdout.columns }).fill('―').join('')
  );
  console.log(error(`\nThe build failed.`));
  console.error(error(`${e.message}`));
  process.exit(1);
});
