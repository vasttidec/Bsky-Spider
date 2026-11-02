import fs from 'node:fs';
import path from 'node:path';
import * as ResEdit from 'resedit';
import * as PELibrary from 'pe-library';

const exePath = path.resolve('release', 'win-unpacked', 'Bsky-Spider.exe');
if (!fs.existsSync(exePath)) {
  throw new Error(`EXE not found: ${exePath}`);
}

const binary = fs.readFileSync(exePath);
const executable = PELibrary.NtExecutable.from(binary, { ignoreCert: true });
const resources = PELibrary.NtExecutableResource.from(executable);
const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
if (!versionInfo) {
  throw new Error('EXE version information was not found');
}

for (const language of versionInfo.getAllLanguagesForStringValues()) {
  versionInfo.removeStringValue(language, 'LegalCopyright', false);
  versionInfo.removeStringValue(language, 'CompanyName', false);
  versionInfo.removeStringValue(language, 'LegalTrademarks', false);
  versionInfo.setStringValue(
    language,
    'FileDescription',
    'Local media downloader for Bsky',
    false,
  );
}

// Drop the VarFileInfo translation table so Windows Explorer leaves the
// "Language" property empty while retaining the version string table.
versionInfo.replaceAvailableLanguages([]);
versionInfo.outputToResourceEntries(resources.entries);
resources.outputResource(executable);
fs.writeFileSync(exePath, Buffer.from(executable.generate()));

console.log(
  'Patched EXE metadata: FileDescription="Local media downloader for Bsky", copyright/language cleared',
);
