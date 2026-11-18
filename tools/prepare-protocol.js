// Build the handler-facing schema FROM the two primary protocol files. This
// layer only renames fields/types; numeric IDs and wire types come from them.
const fs=require('fs'),path=require('path'),pb=require('protobufjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'src/proto'),out=path.join(dir,'4.7.51');

function writeIfChanged(name, content) {
    const file = path.join(out, name);
    const bytes = Buffer.from(content, 'utf8');
    try {
        if (fs.readFileSync(file).equals(bytes)) return;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    fs.writeFileSync(file, bytes);
}

const source=pb.parse(fs.readFileSync(path.join(dir,'StarRail.proto'),'utf8'),{keepCase:true}).root;
source.resolveAll();const json=source.toJSON();
const names=JSON.parse(fs.readFileSync(path.join(out,'handler-field-names.json')));
const aliases=JSON.parse(fs.readFileSync(path.join(out,'native/aliases.json')));
for(const [name,type]of Object.entries(json.nested)){
 if(!type.fields)continue;const renames={};
 for(const [old,f]of Object.entries(type.fields))renames[old]=names[name]?.[f.id]||old;
 if(new Set(Object.values(renames)).size!==Object.keys(renames).length)throw Error('field alias collision: '+name);
 type.fields=Object.fromEntries(Object.entries(type.fields).map(([n,f])=>[renames[n],f]));
 for(const oneof of Object.values(type.oneofs||{}))oneof.oneof=oneof.oneof.map(n=>renames[n]);
}
for(const [raw,name] of Object.entries(aliases))if(raw!==name && json.nested[raw] && !json.nested[name])json.nested[name]=json.nested[raw];
const enums=JSON.parse(fs.readFileSync(path.join(out,'handler-enums.json')));
for(const [name,e]of Object.entries(enums)) {
 if(!json.nested[name])json.nested[name]=e;
 else if(json.nested[name].values)json.nested[name].values={...e.values,...json.nested[name].values};
}
const runtime=pb.Root.fromJSON(json);runtime.resolveAll();
writeIfChanged('schema.json', JSON.stringify(runtime.toJSON()));
const commands=JSON.parse(fs.readFileSync(path.join(dir,'CmdId.json')));
for(const [raw,id]of Object.entries({...commands}))if(aliases[raw])commands[aliases[raw]]=id;
writeIfChanged('CmdId.json', JSON.stringify(commands, null, 2) + '\n');
const refs=new Set();
function scan(p){for(const f of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,f.name);if(f.isDirectory())scan(full);else if(f.name.endsWith('.ts'))for(const m of fs.readFileSync(full,'utf8').matchAll(/CmdID\.(Cmd\w+)/g))refs.add(m[1]);}}
scan(path.join(root,'src'));
writeIfChanged('handler-commands.json', JSON.stringify([...refs]));
console.log('[protocol] prepared runtime directly from src/proto/StarRail.proto + CmdId.json');
