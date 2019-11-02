import test from 'ava';
import { transformFile } from 'babel-core';
import fs from 'fs';
import path from 'path';
import util from 'util';
import globby from 'globby';

const exists = util.promisify(fs.exists);
const readFile = util.promisify(fs.readFile);

async function transform(dir) {
	const optionsPath = path.join(__dirname, dir, 'options.json');
	const hasOptions = await exists(optionsPath);
	const options = hasOptions ? require(optionsPath) : {};

	options.plugins = options.plugins || [path.join(__dirname, '../lib/index.js')];
	options.babelrc = false;

	return new Promise((resolve, reject) => {
		transformFile(path.join(dir, 'actual.js'), options, (err, result) => {
			err ? reject(err) : resolve(result.code);
		});
	});
}

function normalize(string) {
	// replace multiple newlines with one, normalize to unix line endings
	return string.trim().replace(/[\r\n]+/g, '\n');
}

for (const dir of globby.sync('fixtures/*', { onlyDirectories: true })) {
	const name = path.basename(path.resolve(__dirname, 'fixtures', dir));
	test(name, async t => {
		let [expected, transformed] = (await Promise.all([
			readFile(path.join(dir, 'expected.js'), 'utf8'),
			transform(dir)
		])).map(normalize);

		t.truthy(expected);
		t.truthy(transformed);
		t.is(expected, transformed);
	});
}
