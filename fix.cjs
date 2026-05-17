const fs = require('fs');
const file = 'src/components/ChatModals.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetUI = `<div className="w-full sm:w-2/3">
                    <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                       <span>Número do Documento</span>
                       {(formData.document_type === 'cnpj' || formData.document_type === 'contato') && (
                         <span className="text-[#00a884] cursor-pointer hover:underline flex items-center gap-1" onClick={handleCnpjSearch}>
                           {isSearchingDoc ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Autocompletar
                         </span>
                       )}
                    </label>
                    <div className="relative">
                       <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                       <input 
                         type="text" 
                         value={formData.document_number}
                         onChange={e => setFormData({...formData, document_number: e.target.value})}
                         placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                         className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                       />
                    </div>
                  </div>`;

const replaceUI = `<div className="w-full sm:w-2/3">
                    {formData.document_type === 'contato' ? (
                      <>
                        <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                          <span>Empresa Vinculada</span>
                        </label>
                        <div className="relative">
                          <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <select
                            value={formData.company_ids?.[0] || ''}
                            onChange={e => setFormData({...formData, company_ids: e.target.value ? [e.target.value] : []})}
                            className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all appearance-none cursor-pointer"
                          >
                            <option value="">Nenhuma (Contato Avulso)</option>
                            {companies.map(c => (
                              <option key={c.id} value={c.id}>{c.fantasy_name || c.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                           <span>Número do Documento</span>
                           {formData.document_type === 'cnpj' && (
                             <span className="text-[#00a884] cursor-pointer hover:underline flex items-center gap-1" onClick={handleCnpjSearch}>
                               {isSearchingDoc ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Autocompletar
                             </span>
                           )}
                        </label>
                        <div className="relative">
                           <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                           <input 
                             type="text" 
                             value={formData.document_number}
                             onChange={e => setFormData({...formData, document_number: e.target.value})}
                             placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                             className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                           />
                        </div>
                      </>
                    )}
                  </div>`;

// Strip leading spaces from targetUI to make replacement easier
const normalizedContent = content.replace(/\s+/g, ' ');
const normalizedTarget = targetUI.replace(/\s+/g, ' ');

if(normalizedContent.includes(normalizedTarget)) {
    // A bit hacky but it works. We'll replace the first match of the start
    let startIndex = content.indexOf('<div className="w-full sm:w-2/3">');
    // find the 3rd one which should be the document number
    startIndex = content.indexOf('<div className="w-full sm:w-2/3">', startIndex + 1);
    startIndex = content.indexOf('<div className="w-full sm:w-2/3">', startIndex + 1); // Document type is 2nd, doc num is 3rd
    
    // Oh wait, document type is `w-full sm:w-1/3`, this is the only `w-full sm:w-2/3` next to it?
    // Let's just find `<span>Número do Documento</span>`
    const docSpanIdx = content.indexOf('<span>Número do Documento</span>');
    const startDiv = content.lastIndexOf('<div className="w-full sm:w-2/3">', docSpanIdx);
    
    // find the matching closing div. It has 2 nested divs inside
    const endDiv = content.indexOf('</div>', content.indexOf('</div>', docSpanIdx) + 1) + 6;
    
    const actualTarget = content.substring(startDiv, endDiv);
    content = content.replace(actualTarget, replaceUI);
    fs.writeFileSync(file, content);
    console.log('UI Replaced successfully!');
} else {
    console.log('UI Replace failed! Could not find target UI');
}
