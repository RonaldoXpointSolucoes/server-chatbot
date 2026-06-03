const PORTUGUESE_COMMON_WORDS = new Set([
  'ok', 'vou', 'responder', 'olá', 'ola', 'sim', 'não', 'nao', 'tudo', 'bem', 'bom', 'boa', 'dia', 'tarde', 'noite',
  'por', 'favor', 'obrigado', 'obrigada', 'de', 'do', 'da', 'em', 'um', 'uma', 'os', 'as', 'o', 'a',
  'que', 'se', 'com', 'para', 'como', 'mais', 'mas', 'eu', 'você', 'voce', 'ele', 'ela', 'nós', 'nos', 'eles', 'elas',
  'me', 'te', 'lhe', 'nos', 'se', 'este', 'esta', 'isto', 'esse', 'essa', 'isso', 'aquele', 'aquela', 'aquilo',
  'ir', 'vai', 'vão', 'vamos', 'fui', 'foi', 'fomos', 'foram', 'iria', 'iriam', 'iremos',
  'ter', 'tenho', 'tem', 'temos', 'têm', 'tinha', 'tinham', 'terá', 'terão', 'teria', 'teriam',
  'ser', 'sou', 'é', 'e', 'somos', 'são', 'era', 'eram', 'será', 'serão', 'seria', 'seriam',
  'estar', 'estou', 'está', 'estamos', 'estão', 'estava', 'estavam', 'estará', 'estarão', 'estaria', 'estariam',
  'fazer', 'faço', 'faz', 'fazemos', 'fazem', 'fiz', 'fez', 'fizemos', 'fizeram', 'fará', 'farão', 'faria', 'fariam',
  'dizer', 'digo', 'diz', 'dizemos', 'dizem', 'disse', 'dissemos', 'disseram', 'dirá', 'dirão', 'diria', 'diriam',
  'poder', 'posso', 'pode', 'podemos', 'podem', 'pude', 'pôde', 'puderam', 'poderá', 'poderão', 'poderia', 'poderiam',
  'ver', 'vejo', 'vê', 'vemos', 'vêem', 'vi', 'viu', 'vimos', 'viram', 'verá', 'verão', 'veria', 'veriam',
  'dar', 'dou', 'dá', 'damos', 'dão', 'dei', 'deu', 'demos', 'deram', 'dará', 'darão', 'daria', 'dariam',
  'aqui', 'ali', 'lá', 'onde', 'quando', 'como', 'porque', 'porquê', 'qual', 'quais', 'quem', 'cujo', 'cuja'
]);

const isWordCorrect = (word) => {
  const isAcronym = word === word.toUpperCase() && word !== word.toLowerCase();
  if (isAcronym) return true;

  const cleanWord = word.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/g, '').trim().toLowerCase().normalize('NFC');
  if (!cleanWord) return true;
  
  if (/\d/.test(cleanWord)) return true;
  if (cleanWord.length <= 1) return true;
  
  if (PORTUGUESE_COMMON_WORDS.has(cleanWord)) return true;
  return false;
};

const inputText = "Ok, vou responder";
const wordsAndSpaces = inputText.split(/(\s+)/);

console.log("Words and Spaces:", wordsAndSpaces);

wordsAndSpaces.forEach((part) => {
  if (/^\s+$/.test(part)) return;
  const cleanWord = part.replace(/^[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+|[.,\/#!$%\^&\*;:{}=\-_`~()?"'“‘”’]+$/g, '');
  const correct = isWordCorrect(cleanWord);
  console.log(`Part: "${part}" -> Clean: "${cleanWord}" -> Correct: ${correct}`);
});
