import React, { useEffect, useState, useRef } from 'react';
import {
  LibraryDocument,
  getAllLibraryDocuments,
  deleteDocumentFromLibrary,
  exportVaultBackup,
  restoreVaultBackup,
} from '../core/storage/documentLibrary';
import { hasVaultPin, verifyVaultPin, setVaultPin, clearVaultPin } from '../core/security';
import { OtiumLogo } from './OtiumLogo';
import {
  X,
  Trash2,
  Share2,
  BookOpen,
  Clock,
  Search,
  Lock,
  Unlock,
  ShieldCheck,
  Delete,
  DownloadCloud,
  UploadCloud,
  CheckCircle2,
  Camera,
  Sparkles,
  Shield,
} from 'lucide-react';

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
  const [toastMsg, setToastMsg] = useState<string>('');
  const backupInputRef = useRef<HTMLInputElement>(null);

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

  const handleExportBackup = async () => {
    triggerHaptic(20);
    try {
      const backupBlob = await exportVaultBackup();
      const filename = `Otium_Vault_Backup_${new Date().toISOString().slice(0, 10)}.otiumvault`;
      const file = new File([backupBlob], filename, { type: 'application/octet-stream' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Otium Scan Vault Backup',
        });
      } else {
        const url = URL.createObjectURL(backupBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setToastMsg('Vault backup exported successfully');
      setTimeout(() => setToastMsg(''), 2500);
    } catch (e) {
      console.warn('Backup export failed:', e);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerHaptic(20);
    try {
      const count = await restoreVaultBackup(file);
      await loadDocs();
      setToastMsg(`Restored ${count} documents from backup!`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err: any) {
      console.warn('Backup restore error:', err);
      setToastMsg('Corrupted or invalid backup file');
      setTimeout(() => setToastMsg(''), 2500);
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
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
    <div className="fixed inset-0 z-50 bg-[#07090e]/95 backdrop-blur-2xl flex flex-col justify-between select-none animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3.5 otium-chrome border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08]">
            <OtiumLogo size={20} className="text-emerald-400" />
            <span className="text-xs font-black tracking-widest text-white">OTIUM</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-gray-200">خزنة المستندات</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-black border border-emerald-500/25">
              {documents.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Backup Vault Archive */}
          {documents.length > 0 && (
            <button
              onClick={handleExportBackup}
              className="p-2 rounded-full glass-button text-gray-300 active:text-emerald-400"
              title="نسخ احتياطي للخزنة (.otiumvault)"
            >
              <DownloadCloud className="w-4 h-4" />
            </button>
          )}

          {/* Restore Vault Archive */}
          <button
            onClick={() => backupInputRef.current?.click()}
            className="p-2 rounded-full glass-button text-gray-300 active:text-emerald-400"
            title="استرجاع من نسخة احتياطية (.otiumvault)"
          >
            <UploadCloud className="w-4 h-4" />
          </button>

          {/* PIN Lock Management */}
          {pinEnabled ? (
            <button
              onClick={handleRemovePin}
              className="p-2 rounded-full glass-button text-emerald-400 active:scale-90"
              title="القفل برمز PIN مفعّل (انقر للتعطيل)"
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
              title="تعيين رمز حماية PIN"
            >
              <Unlock className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-full glass-button text-gray-300 active:text-white"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {toastMsg && (
        <div className="absolute top-24 inset-x-0 flex justify-center z-50 pointer-events-none animate-in fade-in duration-200">
          <span className="px-4 py-1.5 rounded-full bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-1.5 border border-white/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{toastMsg}</span>
          </span>
        </div>
      )}

      {/* Realtime Search Bar */}
      {documents.length > 0 && (
        <div className="px-5 py-2.5">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="البحث في المستندات بالاسم أو التاريخ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl py-2 pl-10 pr-8 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
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

      {/* Document List / Empty Vault Showcase */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        {filteredDocs.length === 0 ? (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center px-4">
            {/* Ambient Glowing Halo & Otium Mark */}
            <div className="relative mb-6 flex items-center justify-center">
              <div className="absolute w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
              <div className="relative w-20 h-20 rounded-3xl otium-card flex items-center justify-center border border-white/[0.12] shadow-2xl">
                <OtiumLogo size={42} className="text-emerald-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
              </div>
            </div>

            <h3 className="text-lg font-bold text-white tracking-wide">
              {searchQuery ? 'لا توجد نتائج مطابقة' : 'خزنة أو تيوم للمستندات'}
            </h3>
            <p className="text-xs text-gray-400 mt-2 max-w-xs leading-relaxed">
              {searchQuery
                ? 'جرب البحث بكلمة أخرى أو اسم مختلف.'
                : 'عقودك وأوراقك ممسوحة ضوئياً ومخزنة محلياً ومشفرة 100% على هاتفك بدون أي خوادم سحابية.'}
            </p>

            {/* Trust Badges */}
            {!searchQuery && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-5 max-w-sm">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-gray-300">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span>تشفير محلي SHA-256</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-gray-300">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>A4 ISO قياسي</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.04] border border-white/[0.08] text-gray-300">
                  <OtiumLogo size={12} className="text-sky-400" />
                  <span>متوافق مع Otium Reader</span>
                </span>
              </div>
            )}

            {/* Quick Action CTA */}
            {!searchQuery && (
              <button
                onClick={() => {
                  triggerHaptic(20);
                  onClose();
                }}
                className="mt-6 flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>بدء مسح مستند جديد الآن</span>
              </button>
            )}
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="otium-card p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-white/[0.08] hover:border-emerald-500/30 transition-all shadow-md group"
            >
              {/* Thumbnail */}
              <div className="w-14 h-18 rounded-xl bg-black/60 border border-white/10 overflow-hidden flex-shrink-0 relative shadow-inner">
                <img src={doc.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-white border border-white/10">
                  {doc.pageCount}p
                </span>
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-gray-100 truncate group-hover:text-emerald-300 transition-colors">
                  {doc.title}
                </h4>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-emerald-400" />
                    <span>{doc.pageCount} {doc.pageCount === 1 ? 'صفحة' : 'صفحات'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-gray-500" />
                    <span>
                      {new Date(doc.createdAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => handleShare(doc)}
                  className="p-2.5 rounded-xl glass-button text-gray-300 active:text-emerald-400 hover:border-emerald-500/40"
                  title="مشاركة المستند PDF"
                >
                  <Share2 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2.5 rounded-xl glass-button text-gray-400 active:text-red-400 hover:border-red-500/40"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Luxury Footer Card */}
      <div className="px-5 py-3.5 otium-chrome border-t border-white/[0.08] flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <OtiumLogo size={14} className="text-emerald-400" />
          <span className="text-[11px] text-gray-300 font-medium">رفيق قارئ أو تيوم • Otium Ecosystem</span>
        </div>
        <span className="text-[11px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          {pinEnabled ? '🔒 مشفر بـ PIN' : '100% دون إنترنت'}
        </span>
      </div>

      <input
        ref={backupInputRef}
        type="file"
        accept=".otiumvault,application/json"
        onChange={handleRestoreFile}
        className="hidden"
      />
    </div>
  );
};
