const fs = require('fs');
const xpath = require('xpath');
const parser = require('xmldom').DOMParser;
const xmlserializer = require('xmlserializer');
const yargs = require('yargs');
const path = require('path');

const options = yargs
  .usage("Usage: node script.js -f <front/path> -b <back/path>")
  .option("f", {alias: "front",
    describe: "Path to frontend app, include root dir <vimis-app-onco>",
    type: "string",
    demandOption: true
  })
  .option("b", {
    alias: "back",
    describe: "Path to backend app, include root dir <vimis-ps01-back-js>",
    type: "string",
    demandOption: true
  })
.argv;

(async () => {
  const fdir = path.join(options.front, 'modules');
  const bdir = path.join(options.back, 'modules', 'storage', 'forms');

  const forms = [];
  const findFrm = async (path2file) => {
    let files = await fs.promises.readdir(path2file);
    files = files.filter( f => !f.startsWith('.'));
    for (let file of files) {
      let fpath = path.join(path2file, file);
      const stats = await fs.promises.stat(fpath);
      if (stats.isDirectory()) {
        await findFrm(fpath);
      } else if (stats.isFile()) {
        let { ext, name } = path.parse(fpath);
        if ( ext == '.frm') {
          forms.push(fpath);
        }
      }
    }
  };

  await findFrm(fdir);
  console.log(forms.length);
  forms.forEach( async frm => {
    let { ext, name } = path.parse(frm);
    let frmName = `${name}${ext}`;
    console.log(frmName);
    const form = await fs.promises.readFile(frm, 'utf8');
    const frontdoc = new parser().parseFromString(form, 'text/xml');
    let datasets = xpath.select('//nf-dataset', frontdoc);
    let actions = xpath.select('//nf-action', frontdoc);
    datasets.forEach( ds => {
      ds.setAttribute('provider', 'ehr');
      ds.setAttribute('endpoint', `/dataset/${frmName}/${ds.getAttribute('id')}`);
    });

    actions.forEach( a => a.setAttribute('provider', 'ehr'));
    try {
      await fs.promises.writeFile(frm, xmlserializer.serializeToString(frontdoc), 'utf-8');
    } catch(err) {
      console.log(err);
    }

    const backdoc = new parser().parseFromString(form, 'text/xml');
    const nodes = xpath.select('//*', backdoc);
    for (let node of nodes) {
      let name = node.localName;
      if (name !== 'nf-form' && name !== 'nf-dataset' && name !== 'nf-action' && name !== 'nf-action-on') {
        node.parentNode.removeChild(node);
      }
    }

    const bpath = path.join(bdir, `${name}_back.frm`);
    console.log(bpath);
    try {
      await fs.promises.writeFile(bpath, xmlserializer.serializeToString(backdoc), 'utf8');
    } catch (err) {
      console.log(err);
    }
  });

})();
