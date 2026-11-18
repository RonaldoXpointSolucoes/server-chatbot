import test from 'node:test';
import assert from 'node:assert/strict';
import {
    isPlaceholderContactName,
    isPhoneOnlyContactName,
    sanitizeIncomingContactName,
    resolveBatchContactName
} from './helpers.js';

test('sanitizeIncomingContactName falls back strictly to phone when name cannot be obtained', () => {
    assert.equal(sanitizeIncomingContactName(null, '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName(undefined, '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName('   ', '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName('Novo Contato', '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName('Sem Nome', '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName('undefined', '5514981830009'), '5514981830009');
    assert.equal(sanitizeIncomingContactName('Luciano Cardoso 🚜', '5514981830009'), 'Luciano Cardoso 🚜');
});

test('resolveBatchContactName protects existing valid names and uses incoming pushName when old is phone-only', () => {
    assert.equal(
        resolveBatchContactName(
            { phone: '5514981830009', name: '5514981830009', custom_name: null },
            'Luciano Cardoso 🚜',
            '5514981830009'
        ),
        'Luciano Cardoso 🚜'
    );

    assert.equal(
        resolveBatchContactName(
            { phone: '5514981830009', name: 'Luciano Cardoso 🚜', custom_name: null },
            '5514981830009',
            '5514981830009'
        ),
        'Luciano Cardoso 🚜'
    );

    assert.equal(
        resolveBatchContactName(
            { phone: '5514981830009', name: '(14) 98183-0009', custom_name: null },
            '   ',
            '5514981830009'
        ),
        '5514981830009'
    );

    assert.equal(
        resolveBatchContactName(null, '', '5514981830009'),
        '5514981830009'
    );

    assert.equal(isPlaceholderContactName('Contato Desconhecido'), true);
    assert.equal(isPhoneOnlyContactName('(14) 98183-0009', '5514981830009'), true);
});
