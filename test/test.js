import test from 'ava';
import { transformFile } from 'babel-core';
import fs from 'mz/fs';
import path from 'path';
import globby from 'globby';

async function transform(dir) {
	const optionsPath = path.join(dir, 'options.json');
	const hasOptions = await fs.exists(optionsPath);
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

globby.sync(path.join(__dirname, 'fixtures/*')).forEach(dir => {
	const name = path.basename(path.resolve(__dirname, 'fixtures', dir));
	test(name, async t => {
		let [expected, transformed] = (await Promise.all([
			fs.readFile(path.join(dir, 'expected.js'), 'utf8'),
			transform(dir)
		])).map(normalize);

		t.truthy(expected);
		t.truthy(transformed);
		t.is(expected, transformed);
	});
});
