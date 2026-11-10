const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const packages = [
    'rkrs_lead_notasks.zip',
    'rkrs_activity_panel/widget-app/dist-package/rkrs-activity-prototype.zip',
    'rkrs_lead_distribution/widget-app/dist-package/rkrs-lead-distribution.zip',
    'integration-packages/amocrm-pro-service/amocrm-pro-service-0.6.2.zip',
];
function read(archive, file) {
    return execFileSync('unzip', ['-p', path.join(root, archive), file], { encoding: 'utf8' });
}
function amd(source) {
    let result;
    vm.runInNewContext(source, { URL, Date, define(_deps, factory) { result = factory(); } });
    return result;
}
for (const archive of packages) {
    test('configured fixture package carries actual shared entry consumer and settings mount ' + archive, () => {
        const source = read(archive, 'lib/company-entry.js');
        assert.equal(source, readFileSync(path.join(__dirname, 'company-entry.js'), 'utf8'));
        const consumer = amd(source);
        assert.equal(typeof consumer.mount, 'function');
        assert.equal(consumer.parseStatus({ state: 'absent' }), 'absent');
        assert.throws(() => consumer.parseStatus({ state: 'unavailable' }));
        const config = amd(read(archive, 'lib/company-entry-deployment.js'));
        assert.equal(config.coreOrigin, 'https://core.example.invalid');
        assert.equal(config.frontendOrigin, 'https://teamos.example.invalid');
        const loader = read(archive, 'script.js');
        assert.match(loader, /CompanyEntry\.mount\(self,/);
        assert.match(loader, /\.\/lib\/company-entry\.js/);
        assert.match(loader, /settings: function/);
        assert(!loader.includes('__RKRS_'));
    });
}
