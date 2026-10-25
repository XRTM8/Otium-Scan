import React, { useEffect, useState } from 'react';
import { LibraryDocument, getAllLibraryDocuments, deleteDocumentFromLibrary } from '../core/storage/documentLibrary';
import { X, Trash2, Share2, BookOpen, Clock, FileText } from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose }) => {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadDocs();
    }
  }, [isOpen]);

  const loadDocs = async () => {
    try {
      const docs = await getAllLibraryDocuments();
      setDocuments(docs);
    } catch (e) {
      console.warn('Failed to load library:', e);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDocumentFromLibrary(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleShare = async (doc: LibraryDocument) => {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col justify-between select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-4 glass-panel border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <span className="text-base font-semibold text-white">Scanned Library</span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full glass-button text-gray-300 active:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Document List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400">
            <FileText className="w-12 h-12 mb-3 text-emerald-400/40" />
            <p className="text-sm">No saved documents yet.</p>
            <p className="text-xs text-gray-500 mt-1">
              Documents you scan and save will appear here.
            </p>
          </div>
        ) : (
          documents.map((doc) => (
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
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                  <span>{doc.pageCount} pages</span>
                  <span>•</span>
                  <div className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleShare(doc)}
                  className="p-2 rounded-xl glass-button text-gray-300 active:text-emerald-400"
                  title="Share or Open in Otium"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleShare(doc)}
                  className="p-2 rounded-xl glass-button text-gray-300 active:text-emerald-400"
                  title="Share"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-2 rounded-xl glass-button text-red-400 active:scale-90"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Close Bar */}
      <div className="px-6 py-6 glass-panel border-t border-white/10">
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl glass-button text-gray-200 font-semibold text-sm active:scale-95 transition-transform"
        >
          Close Library
        </button>
      </div>
    </div>
  );
};
