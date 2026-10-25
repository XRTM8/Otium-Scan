import React, { useEffect, useState } from 'react';
import { LibraryDocument, getAllLibraryDocuments, deleteDocumentFromLibrary } from '../core/storage/documentLibrary';
import { X, Trash2, Share2, BookOpen, Clock, FileText, Search } from 'lucide-react';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({ isOpen, onClose }) => {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredDocs = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex flex-col justify-between select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 pt-12 pb-3 glass-panel border-b border-white/10">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-400" />
          <span className="text-base font-semibold text-white">Scanned Library</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
            {documents.length}
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full glass-button text-gray-300 active:text-white"
        >
          <X className="w-5 h-5" />
        </button>
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
        <span className="text-emerald-400 font-medium">100% Offline & Private</span>
      </div>
    </div>
  );
};
