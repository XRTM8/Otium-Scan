import React, { useEffect, useState } from 'react';
import { LibraryDocument, getAllLibraryDocuments, deleteDocumentFromLibrary } from '../core/storage/documentLibrary';
import { hasVaultPin, verifyVaultPin, setVaultPin, clearVaultPin } from '../core/security';
import { X, Trash2, Share2, BookOpen, Clock, FileText, Search, Lock, Unlock, ShieldCheck, Delete } from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose }) => {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Cryptographic Vault PIN states
  const [pinEnabled, setPinEnabled] = useState<boolean>(() => hasVaultPin());
  const [enteredPin, setEnteredPin] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => !hasVaultPin());
  const [isSettingPin, setIsSettingPin] = useState<boolean>(false);
  const [newPinDraft, setNewPinDraft] = useState<string>('');
  const [pinError, setPinError] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const hasPin = hasVaultPin();
      setPinEnabled(hasPin);
      setIsUnlocked(!hasPin);
      setEnteredPin('');
      setPinError(false);
      loadDocs();
    }
  }, [isOpen]);

  const triggerHaptic = (duration = 15) => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch {}
    }
  };

  const loadDocs = async () => {
    try {
      const docs = await getAllLibraryDocuments();
      setDocuments(docs);
    } catch (e) {
      console.warn('Failed to load library:', e);
    }
  };

  const handleDelete = async (id: string) => {
    triggerHaptic(15);
    await deleteDocumentFromLibrary(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleShare = async (doc: LibraryDocument) => {
    triggerHaptic(15);
    const file = new File([doc.pdfBlob], `${doc.title}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: doc.title,
      });
    } else {
      const url = URL.createObjectURL(doc.pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handlePinDigit = async (digit: string) => {
    triggerHaptic(10);
    if (isSettingPin) {
      if (newPinDraft.length < 4) {
        const next = newPinDraft + digit;
        setNewPinDraft(next);
        if (next.length === 4) {
          await setVaultPin(next);
          setPinEnabled(true);
          setIsSettingPin(false);
          setIsUnlocked(true);
          setNewPinDraft('');
          triggerHaptic(25);
        }
      }
      return;
    }

    if (enteredPin.length < 4) {
      const next = enteredPin + digit;
      setEnteredPin(next);
      if (next.length === 4) {
        const isValid = await verifyVaultPin(next);
        if (isValid) {
          setIsUnlocked(true);
          setEnteredPin('');
          triggerHaptic(25);
        } else {
          setPinError(true);
          triggerHaptic(40);
          setTimeout(() => {
            setEnteredPin('');
            setPinError(false);
          }, 600);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    triggerHaptic(10);
    if (isSettingPin) {
      setNewPinDraft((prev) => prev.slice(0, -1));
    } else {
      setEnteredPin((prev) => prev.slice(0, -1));
    }
  };

  const handleRemovePin = () => {
    triggerHaptic(20);
    clearVaultPin();
    setPinEnabled(false);
    setIsUnlocked(true);
    setIsSettingPin(false);
  };

  if (!isOpen) return null;

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  // Vault Locked PIN Screen
  if (!isUnlocked || isSettingPin) {
    const currentCode = isSettingPin ? newPinDraft : enteredPin;
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col justify-between p-6 select-none animate-in fade-in duration-200">
        <div className="flex items-center justify-between pt-8">
          <span className="text-xs text-gray-500 font-semibold tracking-wider uppercase">
            {isSettingPin ? 'Security Configuration' : 'Encrypted Vault'}
          </span>
          <button
            onClick={() => {
              setIsSettingPin(false);
              onClose();
            }}
            className="p-2 rounded-full glass-button text-gray-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PIN Center Display */}
        <div className="flex flex-col items-center justify-center text-center my-auto">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-xl">
            {isSettingPin ? (
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            ) : (
              <Lock className="w-8 h-8 text-emerald-400" />
            )}
          </div>

          <h3 className="text-lg font-bold text-white mb-1">
            {isSettingPin ? 'Set 4-Digit Vault PIN' : 'Enter PIN to Access Vault'}
          </h3>
          <p className="text-xs text-gray-400 max-w-xs mb-8">
            {isSettingPin
              ? 'Choose a 4-digit code to protect all documents stored in this device.'
              : 'Your scanned contracts and documents are encrypted in local storage.'}
          </p>

          {/* 4 Dots Indicator */}
          <div className={`flex items-center gap-4 ${pinError ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((idx) => {
              const isFilled = currentCode.length > idx;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all ${
                    pinError
                      ? 'border-red-500 bg-red-500/50'
                      : isFilled
                      ? 'border-emerald-400 bg-emerald-400 shadow-md shadow-emerald-400/50 scale-110'
                      : 'border-white/20 bg-transparent'
                  }`}
                />
              );
            })}
          </div>

          {pinError && (
            <span className="text-xs text-red-400 font-semibold mt-3 animate-in fade-in">
              Incorrect PIN. Try again.
            </span>
          )}
        </div>

        {/* Tactile Numeric Keypad */}
        <div className="w-full max-w-xs mx-auto flex flex-col gap-3 pb-8">
          {[
            ['1', '2', '3'],
            ['4', '5', '6'],
            ['7', '8', '9'],
          ].map((row, rIdx) => (
            <div key={rIdx} className="flex justify-around">
              {row.map((digit) => (
                <button
                  key={digit}
                  onClick={() => handlePinDigit(digit)}
                  className="w-18 h-18 rounded-full glass-button text-2xl font-semibold text-white active:scale-90 transition-transform shadow-md"
                >
                  {digit}
                </button>
              ))}
            </div>
          ))}

          <div className="flex justify-around items-center">
            <div className="w-18 h-18 flex items-center justify-center">
              {isSettingPin ? (
                <button
                  onClick={() => setIsSettingPin(false)}
                  className="text-xs text-gray-400 underline"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <button
              onClick={() => handlePinDigit('0')}
              className="w-18 h-18 rounded-full glass-button text-2xl font-semibold text-white active:scale-90 transition-transform shadow-md"
            >
              0
            </button>

            <button
              onClick={handlePinBackspace}
              className="w-18 h-18 rounded-full glass-button flex items-center justify-center text-gray-300 active:scale-90 transition-transform"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Vault Unlocked Document Library
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col justify-between select-none animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-3 glass-panel border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <span className="text-base font-semibold text-white">Scanned Library</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
            {documents.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* PIN Lock Management */}
          {pinEnabled ? (
            <button
              onClick={handleRemovePin}
              className="p-2 rounded-full glass-button text-emerald-400 active:scale-90"
              title="PIN Lock Enabled (Click to disable)"
            >
              <Lock className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                triggerHaptic(15);
                setIsSettingPin(true);
                setNewPinDraft('');
              }}
              className="p-2 rounded-full glass-button text-gray-400 active:text-emerald-400"
              title="Set Security PIN"
            >
              <Unlock className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-full glass-button text-gray-300 active:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Realtime Search Bar */}
      {documents.length > 0 && (
        <div className="px-6 py-2.5">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search documents by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-gray-400 text-xs hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
        {filteredDocs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
            <FileText className="w-12 h-12 mb-3 text-emerald-400/40" />
            <p className="text-sm font-medium">
              {searchQuery ? 'No documents match your search.' : 'No saved documents yet.'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {searchQuery
                ? 'Try a different search term.'
                : 'Documents you scan and save will appear here.'}
            </p>
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="glass-panel p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-white/10"
            >
              {/* Thumbnail */}
              <div className="w-12 h-16 rounded-lg bg-black border border-white/10 overflow-hidden flex-shrink-0">
                <img src={doc.thumbnail} alt="" className="w-full h-full object-cover" />
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-gray-100 truncate">{doc.title}</h4>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-emerald-400" />
                    {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    {new Date(doc.createdAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleShare(doc)}
                  className="p-2 rounded-xl glass-button text-gray-300 active:text-emerald-400"
                  title="Share PDF"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 rounded-xl glass-button text-gray-400 active:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 glass-panel border-t border-white/10 flex items-center justify-between text-xs text-gray-400">
        <span>Vault: IndexedDB Persistent Storage</span>
        <span className="text-emerald-400 font-medium">
          {pinEnabled ? '🔒 PIN Protected' : '100% Offline & Private'}
        </span>
      </div>
    </div>
  );
};
