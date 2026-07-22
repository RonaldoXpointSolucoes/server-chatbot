import fs from 'fs';
import path from 'path';

const filePath = 'c:/Users/NOTE-(FORM)02JUL26/Documents/Projetos/Antigravity/ChatBoot/src/components/ChatModals.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Container Size and Border Styling
const containerTarget = 'className="relative w-full h-full max-h-screen bg-slate-50 dark:bg-[#0c1317] border-none rounded-none shadow-none p-0 md:p-6 flex flex-col gap-4 animate-in fade-in duration-300 overflow-y-auto md:overflow-hidden text-left"';
const containerReplacement = 'className="relative w-full h-full max-h-screen bg-slate-50 dark:bg-[#0c1317] border-none rounded-none shadow-none p-0 md:p-6 flex flex-col gap-4 animate-in fade-in duration-300 overflow-y-auto md:overflow-hidden text-left md:max-w-7xl md:h-[90dvh] md:max-h-[900px] md:rounded-[32px] md:border md:border-white/5 md:shadow-2xl"';
content = content.replace(containerTarget, containerReplacement);

// 2. Mobile Header bg & close button hover
const mobileHeaderTarget = `        {/* Mobile Header & Filter Toggle Bar */}
        <div className="md:hidden sticky top-0 z-50 flex items-center justify-between px-5 py-4 bg-slate-50/90 dark:bg-[#0c1317]/90 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5 shadow-sm shrink-0">
          <div className="flex flex-col text-left">
            <span className="text-xs font-black uppercase text-slate-800 dark:text-white">Tickets Fechados</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
              {instances.find(i => i.id === selectedInstanceId)?.display_name || 'Todas as Caixas'} • {
                dateFilter === 'today' ? 'Hoje' :
                dateFilter === 'week' ? 'Últimos 7 dias' :
                dateFilter === 'month' ? 'Mês Atual' : 'Todos'
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 border cursor-pointer",
                showMobileFilters
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-455"
                  : "bg-slate-100 dark:bg-white/5 border-slate-200/40 dark:border-white/5 text-slate-600 dark:text-[#aebac1]"
              )}
            >
              <span>{showMobileFilters ? 'Ocultar Filtros' : 'Filtrar'}</span>
              <ChevronDown size={12} className={cn("transition-transform duration-200", showMobileFilters && "rotate-180")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full bg-slate-200/60 dark:bg-white/5 hover:bg-slate-350 dark:hover:bg-white/10 text-slate-550 dark:text-[#aebac1] transition-colors cursor-pointer shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>`;

const mobileHeaderReplacement = `        {/* Mobile Header & Filter Toggle Bar */}
        <div className="md:hidden sticky top-0 z-50 flex items-center justify-between px-5 py-4 bg-[#0c1317]/80 backdrop-blur-xl border-b border-white/5 shadow-sm shrink-0">
          <div className="flex flex-col text-left">
            <span className="text-xs font-black uppercase text-slate-800 dark:text-white">Tickets Fechados</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
              {instances.find(i => i.id === selectedInstanceId)?.display_name || 'Todas as Caixas'} • {
                dateFilter === 'today' ? 'Hoje' :
                dateFilter === 'week' ? 'Últimos 7 dias' :
                dateFilter === 'month' ? 'Mês Atual' : 'Todos'
              }
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 border cursor-pointer",
                showMobileFilters
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-white/5 border-slate-200/40 dark:border-white/5 text-slate-600 dark:text-[#aebac1]"
              )}
            >
              <span>{showMobileFilters ? 'Ocultar Filtros' : 'Filtrar'}</span>
              <ChevronDown size={12} className={cn("transition-transform duration-200", showMobileFilters && "rotate-180")} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full bg-slate-200/60 dark:bg-white/5 hover:bg-[#2a3942] dark:hover:bg-white/10 text-slate-500 dark:text-[#aebac1] transition-colors cursor-pointer shrink-0">
              <X size={14} />
            </button>
          </div>
        </div>`;
content = content.replace(mobileHeaderTarget, mobileHeaderReplacement);

// 3. Desktop Header and View Switcher
const desktopHeaderTarget = `          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl text-white shadow-md shadow-emerald-500/10 shrink-0">
                <FolderCheck size={20} className="animate-pulse" />
              </div>
              <div className="flex flex-col text-left">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                  Tickets Fechados
                </h3>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  Auditoria de atendimentos e base de conhecimento resolvida
                </p>
              </div>
            </div>
            
            {/* View switcher */}
            <div className="flex gap-1 bg-slate-200/60 dark:bg-[#111b21] p-1 rounded-xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[36px] items-center ml-auto mr-4 shadow-inner">
              <button
                onClick={() => setActiveView('kanban')}
                type="button"
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                  activeView === 'kanban'
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-650 dark:text-emerald-455 font-black"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span>Mosaico</span>
              </button>
              <button
                onClick={() => setActiveView('dashboard')}
                type="button"
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                  activeView === 'dashboard'
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-455 font-black"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span>Insights I.A.</span>
              </button>
            </div>

            <button onClick={onClose} className="hidden md:flex p-2 rounded-full bg-slate-200/60 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-555 hover:text-slate-700 dark:text-[#aebac1] dark:hover:text-white transition-colors cursor-pointer shrink-0">
              <X size={16} />
            </button>
          </div>`;

const desktopHeaderReplacement = `          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-white/5 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl text-white shadow-md shadow-emerald-500/10 shrink-0">
                <FolderCheck size={20} />
              </div>
              <div className="flex flex-col text-left">
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                  Tickets Fechados
                </h3>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                  Auditoria de atendimentos e base de conhecimento resolvida
                </p>
              </div>
            </div>
            
            {/* View switcher */}
            <div className="flex gap-1 bg-slate-200/60 dark:bg-[#182229]/40 p-1 rounded-xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[36px] items-center ml-auto mr-4 shadow-inner">
              <button
                onClick={() => setActiveView('kanban')}
                type="button"
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                  activeView === 'kanban'
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-black"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span>Mosaico</span>
              </button>
              <button
                onClick={() => setActiveView('dashboard')}
                type="button"
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[9.5px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer",
                  activeView === 'dashboard'
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-black"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span>Insights I.A.</span>
              </button>
            </div>

            <button onClick={onClose} className="hidden md:flex p-2 rounded-full bg-slate-200/60 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer shrink-0">
              <X size={16} />
            </button>
          </div>`;
content = content.replace(desktopHeaderTarget, desktopHeaderReplacement);

// 4. Search input & Inbox selector & Date Tabs Background
const searchAndSelectorTarget = `            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-555" size={14} />
              <input
                type="text"
                placeholder="Buscar por cliente, atendente, problema ou resumo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-semibold font-sans transition-all shadow-sm text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>

            {/* Caixa de Entrada Selector */}
            <div className="relative min-w-[200px] shrink-0">
              <Inbox className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              <select
                value={selectedInstanceId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedInstanceId(val);
                  localStorage.setItem('closed_tickets_selected_instance_id', val);
                }}
                className="w-full text-xs pl-10 pr-8 py-2.5 bg-white dark:bg-[#111b21] border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-bold transition-all shadow-sm text-slate-800 dark:text-white appearance-none cursor-pointer"
              >`;

const searchAndSelectorReplacement = `            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              <input
                type="text"
                placeholder="Buscar por cliente, atendente, problema ou resumo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-2.5 bg-white dark:bg-[#182229]/40 border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-semibold font-sans transition-all shadow-sm text-slate-800 dark:text-[#e9edef] placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>

            {/* Caixa de Entrada Selector */}
            <div className="relative min-w-[200px] shrink-0">
              <Inbox className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
              <select
                value={selectedInstanceId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedInstanceId(val);
                  localStorage.setItem('closed_tickets_selected_instance_id', val);
                }}
                className="w-full text-xs pl-10 pr-8 py-2.5 bg-white dark:bg-[#182229]/40 border border-slate-200 dark:border-white/5 rounded-2xl focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 font-bold transition-all shadow-sm text-slate-800 dark:text-white appearance-none cursor-pointer"
              >`;
content = content.replace(searchAndSelectorTarget, searchAndSelectorReplacement);

// 5. Date filter tabs wrapper background
const dateFilterTabsBgTarget = '            <div className="flex gap-1 bg-slate-200/60 dark:bg-[#111b21] p-1 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner">';
const dateFilterTabsBgReplacement = '            <div className="flex gap-1 bg-slate-200/60 dark:bg-[#182229]/40 p-1 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner">';
content = content.replace(dateFilterTabsBgTarget, dateFilterTabsBgReplacement);

// 6. Selected date filter pills
const dateFilterPillsTarget = `                    dateFilter === btn.id 
                      ? "bg-white dark:bg-white/10 shadow-sm text-emerald-650 dark:text-emerald-455 font-extrabold" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"`;
const dateFilterPillsReplacement = `                    dateFilter === btn.id 
                      ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-extrabold" 
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"`;
content = content.replace(dateFilterPillsTarget, dateFilterPillsReplacement);

// 7. Day Selector Background
const daySelectorBgTarget = `        {/* Weekly Day Selector */}
        <div className="flex justify-center items-center gap-2 bg-white dark:bg-[#111b21]/50 p-2.5 rounded-2xl border border-slate-200/60 dark:border-white/5 select-none overflow-x-auto shrink-0 custom-scrollbar mx-5 md:mx-0">`;
const daySelectorBgReplacement = `        {/* Weekly Day Selector */}
        <div className="flex justify-center items-center gap-2 bg-white dark:bg-[#182229]/20 p-2.5 rounded-2xl border border-slate-200/60 dark:border-white/5 select-none overflow-x-auto shrink-0 custom-scrollbar mx-5 md:mx-0">`;
content = content.replace(daySelectorBgTarget, daySelectorBgReplacement);

const todayButtonTarget = `                    : isToday
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-455 font-bold border-emerald-500/20 hover:bg-emerald-500/20"`;
const todayButtonReplacement = `                    : isToday
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border-emerald-500/20 hover:bg-emerald-500/20"`;
content = content.replace(todayButtonTarget, todayButtonReplacement);

// 8. Metrics Row Cards
const totalCardTarget = `          <div className="bg-white dark:bg-[#111b21]/60 border border-slate-200/60 dark:border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden group animate-in fade-in duration-300">`;
const totalCardReplacement = `          <div className="bg-[#182229]/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden group animate-in fade-in duration-300">';`;

const closedCardTarget = `          {/* Fechados */}
          <div className="bg-white dark:bg-[#111b21]/60 border border-slate-200/60 dark:border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;
const closedCardReplacement = `          {/* Fechados */}
          <div className="bg-[#182229]/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;

const openCardTarget = `          {/* Abertos */}
          <div className="bg-white dark:bg-[#111b21]/60 border border-slate-200/60 dark:border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;
const openCardReplacement = `          {/* Abertos */}
          <div className="bg-[#182229]/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;

const healthCardTarget = `          {/* Saúde do Atendimento */}
          <div className="bg-white dark:bg-[#111b21]/60 border border-slate-200/60 dark:border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;
const healthCardReplacement = `          {/* Saúde do Atendimento */}
          <div className="bg-[#182229]/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden animate-in fade-in duration-300">`;

content = content.replace(totalCardTarget, `          <div className="bg-[#182229]/40 border border-white/5 rounded-2xl p-3 flex items-center justify-between shadow-sm relative overflow-hidden group animate-in fade-in duration-300">`);
content = content.replace(closedCardTarget, closedCardReplacement);
content = content.replace(openCardTarget, openCardReplacement);
content = content.replace(healthCardTarget, healthCardReplacement);

// 9. Kanban Tab Selector & Main body columns background
const kanbanTabSelectorTarget = `        {/* Kanban Tab Selector for Mobile / Tablet */}
        {activeView === 'kanban' && (
          <div className={cn(
            "mx-5 md:mx-0 gap-1.5 bg-slate-200/60 dark:bg-[#111b21] p-1.5 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner",
            selectedTicket ? "flex xl:hidden" : "flex md:hidden"
          )}>`;
const kanbanTabSelectorReplacement = `        {/* Kanban Tab Selector for Mobile / Tablet */}
        {activeView === 'kanban' && (
          <div className={cn(
            "mx-5 md:mx-0 gap-1.5 bg-slate-200/60 dark:bg-[#182229]/40 p-1.5 rounded-2xl border border-slate-200/40 dark:border-white/5 select-none shrink-0 h-[38px] items-center shadow-inner",
            selectedTicket ? "flex xl:hidden" : "flex md:hidden"
          )}>`;
content = content.replace(kanbanTabSelectorTarget, kanbanTabSelectorReplacement);

const kanbanTabSelectorButtonTarget = `                  activeKanbanTab === col.id 
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-650 dark:text-emerald-455 font-extrabold" `;
const kanbanTabSelectorButtonReplacement = `                  activeKanbanTab === col.id 
                    ? "bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400 font-extrabold" `;
content = content.replace(kanbanTabSelectorButtonTarget, kanbanTabSelectorButtonReplacement);

const columnWrapperTarget = `                      className={cn(
                        "flex flex-col h-fit md:h-full bg-slate-100/50 dark:bg-[#111b21]/45 border rounded-[24px] overflow-hidden transition-all duration-200 shadow-sm border-slate-200/60 dark:border-white/5",`;
const columnWrapperReplacement = `                      className={cn(
                        "flex flex-col h-fit md:h-full bg-slate-100/50 dark:bg-[#182229]/20 border rounded-3xl overflow-hidden transition-all duration-200 shadow-sm border-slate-200/60 dark:border-white/5",`;
content = content.replace(columnWrapperTarget, columnWrapperReplacement);

// 10. Card backgrounds and properties
const cardWrapperTarget = `                                  "group p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-300 bg-white hover:bg-slate-50 dark:bg-[#182229]/80 dark:hover:bg-[#182229] hover:scale-[1.015] hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col gap-2 relative border-slate-200/60 dark:border-white/5",`;
const cardWrapperReplacement = `                                  "group p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-300 bg-white hover:bg-slate-50 dark:bg-[#1f2c34]/40 dark:hover:bg-[#1f2c34]/60 hover:scale-[1.015] hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] flex flex-col gap-2 relative border-slate-200/60 dark:border-white/5",`;
content = content.replace(cardWrapperTarget, cardWrapperReplacement);

const durationSpanTarget = `                                    <span className="flex items-center gap-1 font-semibold text-slate-550 dark:text-[#aebac1]">`;
const durationSpanReplacement = `                                    <span className="flex items-center gap-1 font-semibold text-slate-400 dark:text-[#aebac1]">`;
content = content.replace(durationSpanTarget, durationSpanReplacement);

const statsFooterTarget = `                                {/* Bottom Statistics Footer */}
                                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between flex-wrap gap-2 text-[9px] font-black text-slate-455 select-none">`;
const statsFooterReplacement = `                                {/* Bottom Statistics Footer */}
                                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between flex-wrap gap-2 text-[9px] font-black text-slate-400 select-none">`;
content = content.replace(statsFooterTarget, statsFooterReplacement);

// 11. Ticket Details Panel non-standards
const detailsHeaderTarget = `              <div className="flex items-center justify-between border-b border-gray-200/50 dark:border-white/5 pb-3 shrink-0 relative">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                    Detalhes do Ticket #{selectedTicket.id}
                  </h4>
                  <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-455 uppercase tracking-wide flex flex-col gap-0.5 mt-0.5">
                    <span>🏢 {selectedTicket.companyFantasyName || 'Empresa Própria'}</span>
                    {selectedTicket.companyName && selectedTicket.companyName.toLowerCase() !== selectedTicket.companyFantasyName?.toLowerCase() && (
                      <span className="text-[9px] font-semibold text-gray-405 dark:text-gray-500 pl-4 lowercase first-letter:uppercase">
                        Empresa: {selectedTicket.companyName}
                      </span>
                    )}
                  </span>`;

const detailsHeaderReplacement = `              <div className="flex items-center justify-between border-b border-gray-200/50 dark:border-white/5 pb-3 shrink-0 relative">
                <div className="flex flex-col gap-1">
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider">
                    Detalhes do Ticket #{selectedTicket.id}
                  </h4>
                  <span className="text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex flex-col gap-0.5 mt-0.5">
                    <span>🏢 {selectedTicket.companyFantasyName || 'Empresa Própria'}</span>
                    {selectedTicket.companyName && selectedTicket.companyName.toLowerCase() !== selectedTicket.companyFantasyName?.toLowerCase() && (
                      <span className="text-[9px] font-semibold text-slate-400 dark:text-gray-500 pl-4 lowercase first-letter:uppercase">
                        Empresa: {selectedTicket.companyName}
                      </span>
                    )}
                  </span>`;
content = content.replace(detailsHeaderTarget, detailsHeaderReplacement);

const excludeReportsSpanTarget = `                          <span className="text-[10.5px] font-black uppercase text-rose-600 dark:text-rose-455 tracking-wider flex items-center gap-1">`;
const excludeReportsSpanReplacement = `                          <span className="text-[10.5px] font-black uppercase text-rose-600 dark:text-rose-400 tracking-wider flex items-center gap-1">`;
content = content.replace(excludeReportsSpanTarget, excludeReportsSpanReplacement);

const aiAlertTarget = `              {/* AI Processing Error Log Alert */}
              {(selectedTicket.metadata?.error_log || selectedTicket.problem_description === "Erro no processamento do problema." || selectedTicket.metadata?.summary === "Erro ao gerar resumo da solução.") && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-450 p-4 rounded-xl text-xs flex flex-col gap-2 leading-relaxed font-sans shrink-0 border-l-[4px] border-l-rose-500 shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-[10px]">
                    <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                    <span>Falha no Processamento da I.A.</span>
                  </div>
                  <p className="font-semibold text-gray-855 dark:text-rose-250 select-text">`;

const aiAlertReplacement = `              {/* AI Processing Error Log Alert */}
              {(selectedTicket.metadata?.error_log || selectedTicket.problem_description === "Erro no processamento do problema." || selectedTicket.metadata?.summary === "Erro ao gerar resumo da solução.") && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 p-4 rounded-xl text-xs flex flex-col gap-2 leading-relaxed font-sans shrink-0 border-l-[4px] border-l-rose-500 shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase tracking-wider text-[10px]">
                    <AlertTriangle size={14} className="text-rose-500 animate-pulse" />
                    <span>Falha no Processamento da I.A.</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-rose-250 select-text">`;
content = content.replace(aiAlertTarget, aiAlertReplacement);

const resolvedBadgeTarget = `                          item.resolved 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-450 border-emerald-500/15" 
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-455 border-rose-500/15"`;
const resolvedBadgeReplacement = `                          item.resolved 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/15" 
                            : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/15"`;
content = content.replace(resolvedBadgeTarget, resolvedBadgeReplacement);

const resolutionSummarySpanTarget = `                  <span className="text-[9.5px] uppercase font-black text-emerald-600 dark:text-emerald-450 tracking-wider">Resolução Completa</span>`;
const resolutionSummarySpanReplacement = `                  <span className="text-[9.5px] uppercase font-black text-emerald-600 dark:text-emerald-400 tracking-wider">Resolução Completa</span>`;
content = content.replace(resolutionSummarySpanTarget, resolutionSummarySpanReplacement);

const operatorsListTarget = `                    {selectedTicket.metadata.operators.map((op: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs text-gray-655 dark:text-gray-300 font-semibold border-b border-gray-150/30 dark:border-white/5 pb-1.5 last:border-b-0 last:pb-0">
                        <span>{op.name}</span>
                        <span className="font-bold text-gray-850 dark:text-white">{op.percentage}% ({op.count} msgs)</span>
                      </div>
                    ))}`;

const operatorsListReplacement = `                    {selectedTicket.metadata.operators.map((op: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-xs text-slate-600 dark:text-gray-300 font-semibold border-b border-gray-150/30 dark:border-white/5 pb-1.5 last:border-b-0 last:pb-0">
                        <span>{op.name}</span>
                        <span className="font-bold text-slate-800 dark:text-white">{op.percentage}% ({op.count} msgs)</span>
                      </div>
                    ))}`;
content = content.replace(operatorsListTarget, operatorsListReplacement);

fs.writeFileSync(filePath, content, 'utf8');
console.log("ChatModals refactored successfully.");
