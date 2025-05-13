document.addEventListener('DOMContentLoaded', () => {
    // --- Global Değişkenler ve Sabitler ---
    const WORD_LIST_FILE = "kelimeler.txt";
    const VALID_LENGTHS = Array.from({length: 6}, (_, i) => i + 4); // 4, 5, 6, 7, 8, 9
    const SUGGESTION_COUNT = 5;
    const TOP_N_FREQUENCY_SUGGESTIONS_FOR_START = 5;
    const INITIAL_SUGGESTION_DISPLAY_COUNT_OTHER = 10;
    const SHOW_ALL_THRESHOLD = 100;
    const MORE_RESULTS_TEXT_IDENTIFIER = ">>>";

    let masterWordList = [];
    let allWordsCurrentLength = [];
    let possibleWords = [];
    let currentWordLength = VALID_LENGTHS.includes(5) ? 5 : VALID_LENGTHS[0];
    let isFirstGuess = true;
    let showingAllSuggestions = false;
    let positionalFrequenciesAllLengths = {};
    let bestStartersGlobal = [];

    const colors = { G: 'grey', S: 'yellow', Y: 'green' };
    const nextColorState = { G: 'S', S: 'Y', Y: 'G' };
    const initialResultLetter = 'G';

    // --- DOM Elementleri ---
    const initialScreen = document.getElementById('initial-screen');
    const solverScreen = document.getElementById('solver-screen');
    const lengthOptionsRow1 = document.getElementById('length-options-row1');
    const startButton = document.getElementById('start-button');
    const loadingMessage = document.getElementById('loading-message');

    const guessInput = document.getElementById('guess-input');
    const resultBoxesContainer = document.getElementById('result-boxes');
    const filterButton = document.getElementById('filter-button');
    const resetButton = document.getElementById('reset-button');
    const newGameButton = document.getElementById('new-game-button');
    const statusMessage = document.getElementById('status-message');
    const suggestionList = document.getElementById('suggestion-list');
    const showAllSuggestionsLink = document.getElementById('show-all-suggestions');

    // --- Yardımcı Fonksiyonlar ---
    function turkishLower(s) {
        if (!s) return "";
        let result = "";
        for (let i = 0; i < s.length; i++) {
            const char = s[i];
            if (char === 'İ') result += 'i';
            else if (char === 'I') result += 'ı';
            else result += char.toLowerCase();
        }
        return result;
    }

    function toDisplayUpper(wordLower) {
        if (!wordLower) return "";
        let upperW = "";
        for (let i = 0; i < wordLower.length; i++) {
            const charL = wordLower[i];
            if (charL === 'i') upperW += 'İ';
            else if (charL === 'ı') upperW += 'I';
            else upperW += charL.toUpperCase();
        }
        return upperW;
    }

    function isValidTurkishChar(char) {
        const lowerChar = turkishLower(char);
        return "abcçdefgğhıijklmnoöpqrsştuüvyzwx".includes(lowerChar);
    }

    // --- Kelime Yükleme ve Frekans Analizi ---
    async function loadWordsAndAnalyze() {
        loadingMessage.style.display = 'block';
        startButton.disabled = true;
        try {
            const response = await fetch(WORD_LIST_FILE);
            if (!response.ok) {
                throw new Error(`Kelimeler dosyası (${WORD_LIST_FILE}) yüklenemedi: ${response.statusText}`);
            }
            const text = await response.text();
            const lines = text.split('\n');
            const loadedWordsSet = new Set();
            const minLen = Math.min(...VALID_LENGTHS);
            const maxLen = Math.max(...VALID_LENGTHS);

            lines.forEach(line => {
                const wordOriginal = line.trim();
                if (!wordOriginal) return;
                const word = turkishLower(wordOriginal);
                if (word.length >= minLen && word.length <= maxLen &&
                    [...word].every(isValidTurkishChar)) {
                    loadedWordsSet.add(word);
                }
            });

            masterWordList = Array.from(loadedWordsSet);
            if (masterWordList.length === 0) {
                alert(`'${WORD_LIST_FILE}' dosyasında geçerli kelime bulunamadı veya dosya boş.`);
                return false;
            }
            console.log(`${masterWordList.length} adet geçerli kelime yüklendi.`);
            analyzeMasterWordListFrequencies();
            return true;
        } catch (error) {
            console.error("Kelime yükleme hatası:", error);
            alert(`Kelime listesi yüklenirken bir sorun oluştu: ${error.message}`);
            return false;
        } finally {
            loadingMessage.style.display = 'none';
            startButton.disabled = false;
        }
    }

    function analyzeMasterWordListFrequencies() {
        console.log("Pozisyonel frekans analizi yapılıyor...");
        positionalFrequenciesAllLengths = {};
        if (!masterWordList || masterWordList.length === 0) return;
        masterWordList.forEach(wordLower => {
            const wordLen = wordLower.length;
            [...wordLower].forEach((letter, index) => {
                const key = `${wordLen}_${index}_${letter}`;
                positionalFrequenciesAllLengths[key] = (positionalFrequenciesAllLengths[key] || 0) + 1;
            });
        });
        console.log("Pozisyonel frekans analizi tamamlandı.");
    }

    function calculateWordScoreFromFrequencies(wordLowerCase, wordLength) {
        let score = 0;
        if (Object.keys(positionalFrequenciesAllLengths).length === 0) return 0;
        [...wordLowerCase].forEach((letter, i) => {
            const key = `${wordLength}_${i}_${letter}`;
            score += positionalFrequenciesAllLengths[key] || 0;
        });
        const uniqueLetters = new Set(wordLowerCase).size;
        if (uniqueLetters === wordLength) score *= 1.5;
        else if (uniqueLetters === wordLength - 1) score *= 1.2;
        return score;
    }

    function getFrequencyScoredSuggestions(wordsToScore, wordLength, count) {
        if (Object.keys(positionalFrequenciesAllLengths).length === 0 || !wordsToScore || wordsToScore.length === 0) {
            return wordsToScore.slice(0, count).sort((a,b) => a.localeCompare(b, 'tr'));
        }
        const scoredWords = wordsToScore.map(wordL => ({
            word: wordL,
            score: calculateWordScoreFromFrequencies(wordL, wordLength)
        }));
        scoredWords.sort((a, b) => {
            if (b.score === a.score) {
                return a.word.localeCompare(b.word, 'tr', { sensitivity: 'base' });
            }
            return b.score - a.score;
        });
        return scoredWords.slice(0, count).map(item => item.word);
    }

    // --- Oyun Mantığı ---
    function createLengthOptions() {
        if (!lengthOptionsRow1) return;
        lengthOptionsRow1.innerHTML = '';
        VALID_LENGTHS.forEach((len) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'wordLength';
            input.value = len;
            if (len === currentWordLength) {
                input.checked = true;
            }
            input.addEventListener('change', () => {
                currentWordLength = parseInt(input.value);
            });
            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${len}`));
            lengthOptionsRow1.appendChild(label);
        });
    }

    function startGame() {
        const selectedRadio = document.querySelector('input[name="wordLength"]:checked');
        if (selectedRadio) {
            currentWordLength = parseInt(selectedRadio.value);
        } else {
            currentWordLength = VALID_LENGTHS.includes(5) ? 5 : VALID_LENGTHS[0];
            const defaultRadioToSelect = document.querySelector(`input[name="wordLength"][value="${currentWordLength}"]`);
            if (defaultRadioToSelect) defaultRadioToSelect.checked = true;
        }
        console.log(`Seçilen uzunluk: ${currentWordLength}`);
        if (masterWordList.length === 0) {
            return;
        }
        startGameLogic();
    }
    
    function startGameLogic() {
        allWordsCurrentLength = masterWordList.filter(word => word.length === currentWordLength);
        if (allWordsCurrentLength.length === 0) {
            alert(`Bu uzunlukta (${currentWordLength}) kelime bulunamadı. Lütfen kelimeler.txt dosyanızı kontrol edin veya farklı bir uzunluk seçin.`);
            return;
        }
        possibleWords = [...allWordsCurrentLength];
        isFirstGuess = true;
        showingAllSuggestions = false;
        guessInput.value = "";
        guessInput.maxLength = currentWordLength;
        filterButton.disabled = false;

        const uniqueLetterStarters = allWordsCurrentLength.filter(w => new Set(w).size === currentWordLength);
        if (uniqueLetterStarters.length > 0) {
            bestStartersGlobal = getFrequencyScoredSuggestions(uniqueLetterStarters, currentWordLength, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START);
        } else {
            bestStartersGlobal = getFrequencyScoredSuggestions(allWordsCurrentLength, currentWordLength, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START);
        }
        if (bestStartersGlobal.length === 0 && allWordsCurrentLength.length > 0) {
            bestStartersGlobal = allWordsCurrentLength.slice(0, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START).sort((a,b) => a.localeCompare(b, 'tr'));
        }
        console.log(`${currentWordLength} harfli en iyi başlangıç önerileri (frekans tabanlı):`, bestStartersGlobal);

        setupResultBoxesAndInput();
        updateSuggestions();
        initialScreen.style.display = 'none';
        solverScreen.style.display = 'block';
        document.title = `Türkçe Wordle Çözücü (${currentWordLength} Harf)`;
        guessInput.focus();
    }

    function setupResultBoxesAndInput() {
        resultBoxesContainer.innerHTML = '';
        let boxFontSize = "1.5em", inputFontSize = "1.4em", boxMinCharWidth = "30px";

        if (currentWordLength >= 9) { boxFontSize = "1.0em"; inputFontSize = "0.9em"; boxMinCharWidth = "26px";}
        else if (currentWordLength >= 8) { boxFontSize = "1.1em"; inputFontSize = "1.0em"; boxMinCharWidth = "28px";}
        else if (currentWordLength >= 7) { boxFontSize = "1.2em"; inputFontSize = "1.1em"; boxMinCharWidth = "30px";}
        else if (currentWordLength >= 6) { boxFontSize = "1.3em"; inputFontSize = "1.2em"; boxMinCharWidth = "32px";}
        
        guessInput.style.fontSize = inputFontSize;
        guessInput.style.letterSpacing = currentWordLength >=7 ? "0.05em" : "0.1em";

        for (let i = 0; i < currentWordLength; i++) {
            const box = document.createElement('div');
            box.classList.add('result-box', 'grey');
            box.textContent = '?';
            box.dataset.index = i;
            box.dataset.state = initialResultLetter;
            box.style.fontSize = boxFontSize;
            box.style.minWidth = boxMinCharWidth;
            box.style.padding = currentWordLength >= 8 ? "0 3px" : "0 5px";
            box.addEventListener('click', toggleResultBoxColor);
            resultBoxesContainer.appendChild(box);
        }
    }

    function toggleResultBoxColor(event) {
        const box = event.target.closest('.result-box');
        if (!box) return;
        const currentState = box.dataset.state;
        const nextState = nextColorState[currentState];
        box.classList.remove(colors[currentState].toLowerCase());
        box.classList.add(colors[nextState].toLowerCase());
        box.dataset.state = nextState;
    }

    function updateResultBoxLetters(guessStrUpper) {
        const boxes = resultBoxesContainer.children;
        for (let i = 0; i < currentWordLength; i++) {
            if (boxes[i]) {
                boxes[i].textContent = (i < guessStrUpper.length) ? guessStrUpper[i] : '?';
            }
        }
    }

    guessInput.addEventListener('input', (e) => {
        const rawValue = e.target.value;
        let currentCursorPosition = e.target.selectionStart;
    
        let valueLower = turkishLower(rawValue);
        
        let filteredValueLower = "";
        for (let i = 0; i < valueLower.length; i++) {
            if (filteredValueLower.length < currentWordLength && isValidTurkishChar(valueLower[i])) {
                filteredValueLower += valueLower[i];
            }
        }
    
        const finalUpper = toDisplayUpper(filteredValueLower);
        e.target.value = finalUpper;
        
        // İmleç pozisyonunu ayarlama
        // Eğer karakter silindiyse veya eklendiyse, orijinal imleç pozisyonu geçerli olmayabilir.
        // Bu, özellikle Türkçe karakter dönüşümlerinde (örn: iki karakterli 'İ'den tek karakterli 'i'ye)
        // veya geçersiz karakterlerin silinmesinde karmaşıklaşabilir.
        // Şimdilik, basit bir yaklaşımla, filtrelenmiş/dönüştürülmüş metnin sonuna veya
        // orjinal pozisyona en yakın geçerli pozisyona ayarlayalım.
        let newCursorPosition = 0;
        if (rawValue.length === 0) { // Eğer input boşaltıldıysa
            newCursorPosition = 0;
        } else if (currentCursorPosition > 0) {
            // Basitçe, orijinal imleç pozisyonunun filtrelenmiş metindeki karşılığını bulmaya çalışalım.
            // Bu mükemmel olmayabilir ama çoğu durumda işe yarar.
            // Orijinal metindeki imlece kadar olan kısmı alıp, onu dönüştürüp uzunluğuna bakabiliriz.
            const prefixRaw = rawValue.substring(0, currentCursorPosition);
            const prefixLower = turkishLower(prefixRaw);
            let prefixFilteredLower = "";
            for (let i = 0; i < prefixLower.length; i++) {
                 if (prefixFilteredLower.length < currentWordLength && isValidTurkishChar(prefixLower[i])) {
                    prefixFilteredLower += prefixLower[i];
                }
            }
            newCursorPosition = prefixFilteredLower.length;
        }
        // Pozisyonun finalUpper sınırları içinde olduğundan emin ol
        newCursorPosition = Math.min(newCursorPosition, finalUpper.length);
        e.target.setSelectionRange(newCursorPosition, newCursorPosition);
    
        updateResultBoxLetters(finalUpper);
    });
    
    guessInput.addEventListener('keydown', (e) => {
        if (e.key === "Enter") {
            handleFilter();
        }
    });

    function handleFilter() {
        const guessUpper = guessInput.value;
        const guess = turkishLower(guessUpper);
        const resultStates = Array.from(resultBoxesContainer.children).map(box => box.dataset.state);
        const resultString = resultStates.join('');

        if (guess.length !== currentWordLength) {
            alert(`Tahmin tam olarak ${currentWordLength} harf olmalıdır.`);
            guessInput.focus(); return;
        }
        if (![...guess].every(isValidTurkishChar)) {
            alert("Tahmin sadece geçerli harf içermelidir.");
            guessInput.focus(); return;
        }

        if (resultString.toUpperCase() === 'Y'.repeat(currentWordLength)) {
            alert(`Tebrikler! Kelimeyi buldunuz: ${guessUpper}`);
            possibleWords = [guess]; isFirstGuess = false; showingAllSuggestions = true;
            updateSuggestions(); filterButton.disabled = true; return;
        }
        
        const initialCount = possibleWords.length;
        possibleWords = filterWordsJS(possibleWords, guess, resultString.toLowerCase(), currentWordLength);
        isFirstGuess = false; showingAllSuggestions = false;
        
        updateSuggestions();
        
        Array.from(resultBoxesContainer.children).forEach(box => {
            box.classList.remove('yellow', 'green'); box.classList.add('grey');
            box.dataset.state = initialResultLetter;
        });
        guessInput.value = ""; 
        updateResultBoxLetters("");
        guessInput.focus();

        if (possibleWords.length === 0) {
            filterButton.disabled = true;
        } else if (possibleWords.length === 1 && initialCount > 1 && !isFirstGuess) {
            const foundWordUpper = toDisplayUpper(possibleWords[0]);
            alert(`Kelime büyük ihtimalle: ${foundWordUpper}`);
            guessInput.value = foundWordUpper;
            updateResultBoxLetters(foundWordUpper);
            Array.from(resultBoxesContainer.children).forEach(box => {
                box.classList.remove('grey', 'yellow'); box.classList.add('green');
                box.dataset.state = 'Y';
            });
            filterButton.disabled = true; showingAllSuggestions = true;
            updateSuggestions();
        }
    }

    function filterWordsJS(currentPossibleWords, guess, resultLower, wordLength) {
        let newPossibleWords = [];
        const minCounts = {}; const exactCounts = {};
        [...guess].forEach((letter, i) => {
            if (resultLower[i] === 'y' || resultLower[i] === 's') {
                minCounts[letter] = (minCounts[letter] || 0) + 1;
            }
        });
        [...guess].forEach((letter, i) => {
            if (resultLower[i] === 'g') {
                if (!minCounts[letter]) { exactCounts[letter] = 0; }
                else { exactCounts[letter] = minCounts[letter]; }
            }
        });
        currentPossibleWords.forEach(word => {
            let isValid = true;
            const wordLetterCounts = {};
            [...word].forEach(char => wordLetterCounts[char] = (wordLetterCounts[char] || 0) + 1);
            for (let i = 0; i < wordLength; i++) {
                if (resultLower[i] === 'y' && word[i] !== guess[i]) { isValid = false; break; }
            } if (!isValid) return;
            for (let i = 0; i < wordLength; i++) {
                if (resultLower[i] === 's') {
                    if (!word.includes(guess[i]) || word[i] === guess[i]) { isValid = false; break; }
                }
            } if (!isValid) return;
            for (const letter in minCounts) {
                if ((wordLetterCounts[letter] || 0) < minCounts[letter]) { isValid = false; break; }
            } if (!isValid) return;
            for (const letter in exactCounts) {
                if ((wordLetterCounts[letter] || 0) !== exactCounts[letter]) { isValid = false; break; }
            } if (!isValid) return;
            for (let i = 0; i < wordLength; i++) {
                if (resultLower[i] === 'g' && word[i] === guess[i]) { isValid = false; break; }
            } if (!isValid) return;
            if (isValid) { newPossibleWords.push(word); }
        });
        return newPossibleWords;
    }

    function updateSuggestions() {
        suggestionList.innerHTML = '';
        showAllSuggestionsLink.style.display = 'none';
        const numPossible = possibleWords.length;
        const currentLen = currentWordLength;

        statusMessage.textContent = `Kalan olası kelime: ${numPossible}`;
        if (isFirstGuess && numPossible > 0 && bestStartersGlobal.length > 0) {
            statusMessage.textContent += " | En iyi başlangıçlar (frekans tabanlı) öneriliyor.";
        } else if (numPossible === 0 && !isFirstGuess){
            statusMessage.textContent = "Eşleşen kelime bulunamadı!";
        } else if (numPossible === 1 && !isFirstGuess) {
             const statusWord = toDisplayUpper(possibleWords[0]);
             if (!filterButton.disabled) statusMessage.textContent = `Sonraki tahmin: ${statusWord}`;
             else statusMessage.textContent = `Kelime bulundu: ${statusWord}`;
        }

        if (numPossible === 0) {
            const li = document.createElement('li'); li.textContent = "(Olası kelime kalmadı)";
            li.classList.add('title'); suggestionList.appendChild(li); return;
        }
        let suggestionsToDisplayLower = [];
        if (showingAllSuggestions) {
            suggestionsToDisplayLower = getFrequencyScoredSuggestions(possibleWords, currentLen, numPossible);
            if(statusMessage.textContent.includes("Kalan olası kelime:") && !(numPossible ===1 && !isFirstGuess)){
                statusMessage.textContent += (numPossible > Math.max(SUGGESTION_COUNT, bestStartersGlobal.length + INITIAL_SUGGESTION_DISPLAY_COUNT_OTHER)) ? " (Tümü listeleniyor)" : "";
            }
        } else {
            if (isFirstGuess) {
                suggestionsToDisplayLower.push(...bestStartersGlobal);
                const remainingAfterStarters = possibleWords.filter(w => !bestStartersGlobal.includes(w));
                if (remainingAfterStarters.length > 0) {
                    const otherFreqScored = getFrequencyScoredSuggestions(
                        remainingAfterStarters, currentLen, INITIAL_SUGGESTION_DISPLAY_COUNT_OTHER
                    );
                    otherFreqScored.forEach(w => { if(!suggestionsToDisplayLower.includes(w)) suggestionsToDisplayLower.push(w); });
                }
            } else {
                if (numPossible <= SUGGESTION_COUNT) {
                    suggestionsToDisplayLower = getFrequencyScoredSuggestions(possibleWords, currentLen, numPossible);
                    if (numPossible > 0 && !showingAllSuggestions) showingAllSuggestions = true;
                } else {
                    suggestionsToDisplayLower = getFrequencyScoredSuggestions(possibleWords, currentLen, SUGGESTION_COUNT);
                }
            }
        }
        
        let listboxHasContent = false;
        const addSuggestionItem = (wordL, isTitle = false, titleText = "") => {
            const li = document.createElement('li');
            if (isTitle) {
                li.textContent = titleText;
                li.classList.add('title');
            } else {
                li.textContent = toDisplayUpper(wordL);
                li.addEventListener('click', () => fillGuessFromSuggestion(wordL));
            }
            suggestionList.appendChild(li);
            listboxHasContent = true;
        };

        if (showingAllSuggestions) {
            addSuggestionItem(null, true, `--- Tüm Olasılıklar (Frekans Sıralı, ${suggestionsToDisplayLower.length}) ---`);
            suggestionsToDisplayLower.forEach(wordL => addSuggestionItem(wordL));
        } else {
            if (isFirstGuess && bestStartersGlobal.length > 0) {
                addSuggestionItem(null, true, `--- En İyi Başlangıç Önerileri (Frekans, ${bestStartersGlobal.length}) ---`);
                bestStartersGlobal.forEach(wordL => addSuggestionItem(wordL));
                const otherDisplayPart = suggestionsToDisplayLower.filter(w => !bestStartersGlobal.includes(w));
                if (otherDisplayPart.length > 0) {
                    addSuggestionItem(null, true, `--- Diğer Öneriler (Frekans, İlk ${otherDisplayPart.length}) ---`);
                    otherDisplayPart.forEach(wordL => addSuggestionItem(wordL));
                }
            } else {
                 suggestionsToDisplayLower.forEach(wordL => addSuggestionItem(wordL));
            }
            const numActuallyShown = suggestionsToDisplayLower.length;
            const numHidden = numPossible - numActuallyShown;
            if (numHidden > 0) {
                showAllSuggestionsLink.textContent = `${MORE_RESULTS_TEXT_IDENTIFIER} ... ve ${numHidden} tane daha`;
                if (numPossible <= SHOW_ALL_THRESHOLD) showAllSuggestionsLink.textContent += " (Tıkla göster)";
                showAllSuggestionsLink.style.display = 'block';
                listboxHasContent = true;
            }
        }
        if (!listboxHasContent && numPossible > 0) { addSuggestionItem(null, true, "(Öneri listesi için kelime bulunamadı.)");}
    }

    function fillGuessFromSuggestion(wordLower) {
        const upper = toDisplayUpper(wordLower);
        guessInput.value = upper;
        updateResultBoxLetters(upper);
        guessInput.focus();
    }

    function resetCurrentGame() {
        if (allWordsCurrentLength.length === 0) { return; }
        possibleWords = [...allWordsCurrentLength];
        isFirstGuess = true; showingAllSuggestions = false;
        guessInput.value = ""; filterButton.disabled = false;
        
        const uniqueLetterStarters = allWordsCurrentLength.filter(w => new Set(w).size === currentWordLength);
        if (uniqueLetterStarters.length > 0) {
            bestStartersGlobal = getFrequencyScoredSuggestions(uniqueLetterStarters, currentWordLength, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START);
        } else {
            bestStartersGlobal = getFrequencyScoredSuggestions(allWordsCurrentLength, currentWordLength, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START);
        }
        if (bestStartersGlobal.length === 0 && allWordsCurrentLength.length > 0) {
            bestStartersGlobal = allWordsCurrentLength.slice(0, TOP_N_FREQUENCY_SUGGESTIONS_FOR_START).sort((a,b)=>a.localeCompare(b,'tr'));
        }
        
        setupResultBoxesAndInput();
        updateResultBoxLetters("");
        updateSuggestions();
        guessInput.focus();
        console.log(`${currentWordLength} harfli oyun sıfırlandı.`);
    }

    function askNewGame() {
        solverScreen.style.display = 'none';
        initialScreen.style.display = 'block';
        document.title = "Türkçe Wordle Çözücü";
        currentWordLength = VALID_LENGTHS.includes(5) ? 5 : VALID_LENGTHS[0];
        createLengthOptions();
        possibleWords = []; allWordsCurrentLength = []; bestStartersGlobal = [];
        isFirstGuess = true; showingAllSuggestions = false;
        statusMessage.textContent = "Kalan olası kelime: 0";
        suggestionList.innerHTML = "";
        showAllSuggestionsLink.style.display = 'none';
        if (guessInput) guessInput.value = ""; // Yeni oyun başlayınca tahmin kutusunu temizle
        if (resultBoxesContainer) resultBoxesContainer.innerHTML = ""; // Sonuç kutularını temizle
    }

    // --- Olay Dinleyicileri ---
    startButton.addEventListener('click', startGame);
    filterButton.addEventListener('click', handleFilter);
    resetButton.addEventListener('click', resetCurrentGame);
    newGameButton.addEventListener('click', askNewGame);
    showAllSuggestionsLink.addEventListener('click', () => {
        if (showingAllSuggestions) return;
        if (possibleWords.length <= SHOW_ALL_THRESHOLD || possibleWords.length === 0) {
            showingAllSuggestions = true;
            updateSuggestions();
        } else {
            alert(`Tümünü göstermek için ${possibleWords.length} kelime çok fazla (Sınır: ${SHOW_ALL_THRESHOLD}).`);
        }
    });

    // Uygulama Başlangıcı
    createLengthOptions();
    loadWordsAndAnalyze(); 
});