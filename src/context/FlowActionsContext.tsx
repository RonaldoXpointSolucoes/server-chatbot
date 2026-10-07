import React, { createContext, useContext } from 'react';

export interface BlockTheme {
    category: 'Bubbles' | 'Inputs' | 'Condicionais' | 'Eventos';
    iconColor: string;
    iconHex: string;
    tagBg: string;
    tagText: string;
    tagBorder: string;
}

export const BLOCK_THEMES: Record<string, BlockTheme> = {
    // Bubbles (Laranja / Coral)
    send_message: { category: 'Bubbles', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    image: { category: 'Bubbles', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    video: { category: 'Bubbles', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    embed: { category: 'Bubbles', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    audio: { category: 'Bubbles', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },

    // Inputs (Laranja / Coral)
    ask: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    number_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    email_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    website_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    date_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    time_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    phone_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    buttons: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    pic_choice: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    payment: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    rating: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    file_input: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },
    cards: { category: 'Inputs', iconColor: 'text-orange-500', iconHex: '#ea580c', tagBg: 'bg-orange-500/20', tagText: 'text-orange-300', tagBorder: 'border-orange-500/30' },

    // Condicionais (Roxo / Violeta)
    set_variable: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    condition: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    redirect: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    script: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    typebot_link: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    wait: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    jump: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    ab_test: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    webhook: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },
    return: { category: 'Condicionais', iconColor: 'text-purple-400', iconHex: '#a855f7', tagBg: 'bg-purple-900/60', tagText: 'text-purple-200', tagBorder: 'border-purple-500/40' },

    // Eventos (Esmeralda / Ciano)
    start: { category: 'Eventos', iconColor: 'text-emerald-400', iconHex: '#10b981', tagBg: 'bg-emerald-500/20', tagText: 'text-emerald-300', tagBorder: 'border-emerald-500/30' },
    command: { category: 'Eventos', iconColor: 'text-sky-400', iconHex: '#38bdf8', tagBg: 'bg-sky-500/20', tagText: 'text-sky-300', tagBorder: 'border-sky-500/30' },
    reply: { category: 'Eventos', iconColor: 'text-sky-400', iconHex: '#38bdf8', tagBg: 'bg-sky-500/20', tagText: 'text-sky-300', tagBorder: 'border-sky-500/30' },
    invalid: { category: 'Eventos', iconColor: 'text-amber-400', iconHex: '#f59e0b', tagBg: 'bg-amber-500/20', tagText: 'text-amber-300', tagBorder: 'border-amber-500/30' }
};

export function getBlockTheme(flowType: string): BlockTheme {
    return BLOCK_THEMES[flowType] || {
        category: 'Bubbles',
        iconColor: 'text-orange-500',
        iconHex: '#ea580c',
        tagBg: 'bg-orange-500/20',
        tagText: 'text-orange-300',
        tagBorder: 'border-orange-500/30'
    };
}

export interface FlowActionsContextType {
    onDuplicateGroup: (groupId: string) => void;
    onDeleteGroup: (groupId: string) => void;
    onExecuteGroup: (groupId: string) => void;
    onUpdateGroupTitle: (groupId: string, newTitle: string) => void;
    onUpdateBlock: (groupId: string, blockIndex: number, updatedFields: Record<string, any>) => void;
    onDeleteBlock: (groupId: string, blockIndex: number) => void;
    onMoveBlockBetweenGroups: (sourceGroupId: string, blockIndex: number, targetGroupId: string, targetIndex?: number) => void;
    onAddBlockToGroup: (groupId: string, blockData: any, targetIndex?: number) => void;
    selectedBlockId: string | null;
    setSelectedBlockId: (id: string | null) => void;
}

export const FlowActionsContext = createContext<FlowActionsContextType | null>(null);

export function useFlowActions() {
    const ctx = useContext(FlowActionsContext);
    return ctx;
}
