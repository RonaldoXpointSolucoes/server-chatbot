const fs = require('fs');
const file = 'src/components/ChatModals.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetUI = `                        <>
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
                        </>`;

const replaceUI = `                        <>
                          <label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">
                            <span>Empresas Vinculadas</span>
                          </label>
                          <div className="w-full max-h-[120px] overflow-y-auto bg-[#f0f2f5] dark:bg-[#111b21] rounded-xl border border-transparent focus-within:border-[#00a884]/50 p-1.5 styled-scrollbar">
                            {companies.length === 0 ? (
                              <div className="text-xs text-gray-500 text-center py-2">Nenhuma empresa encontrada</div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {companies.map(c => (
                                  <label key={c.id} className="flex items-center gap-2.5 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer transition-colors group">
                                    <div className="relative flex items-center justify-center">
                                      <input
                                        type="checkbox"
                                        checked={formData.company_ids?.includes(c.id) || false}
                                        onChange={(e) => {
                                          const currentIds = formData.company_ids || [];
                                          if (e.target.checked) {
                                            setFormData({...formData, company_ids: [...currentIds, c.id]});
                                          } else {
                                            setFormData({...formData, company_ids: currentIds.filter(id => id !== c.id)});
                                          }
                                        }}
                                        className="peer w-4 h-4 cursor-pointer appearance-none border border-gray-400 dark:border-gray-600 rounded bg-transparent checked:bg-[#00a884] checked:border-[#00a884] transition-all"
                                      />
                                      <svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 scale-50 peer-checked:scale-100 transition-all" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    </div>
                                    <span className="text-sm text-[#111b21] dark:text-[#e9edef] truncate group-hover:text-[#00a884] transition-colors">{c.fantasy_name || c.name}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </>`;

// Strip spaces for safe find
const normalizedContent = content.replace(/\s+/g, ' ');
const normalizedTarget = targetUI.replace(/\s+/g, ' ');

if(normalizedContent.includes(normalizedTarget)) {
    const startIdx = content.indexOf('<label className="flex justify-between text-xs font-medium text-gray-500 dark:text-[#8696a0] mb-1">');
    // find the enclosing fragment start `<>`
    const startFrag = content.lastIndexOf('<>', startIdx);
    
    // find the end Fragment `</>`
    const endFrag = content.indexOf('</>', startIdx) + 3;

    const actualTarget = content.substring(startFrag, endFrag);
    content = content.replace(actualTarget, replaceUI);
    fs.writeFileSync(file, content);
    console.log('UI Replaced successfully!');
} else {
    console.log('UI Replace failed! Could not find target UI');
}
