import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import SalesStatusBadge from './SalesStatusBadge';
import { formatDate } from '../lib/utils';
import { FaClock, FaUser, FaStickyNote, FaChevronDown, FaChevronUp } from 'react-icons/fa';

interface SalesStatusHistoryItem {
  id: string;
  old_status: string | null;
  new_status: string;
  created_at: string;
  notes: string | null;
  changed_by?: string | null;
}

interface SalesStatusTimelineProps {
  saleId: string;
  currentStatus: string;
  saleCreatedAt?: string;
}

const statusSteps = ['accepted', 'processing', 'shipped', 'delivered', 'completed'];

export default function SalesStatusTimeline({ saleId, currentStatus, saleCreatedAt }: SalesStatusTimelineProps) {
  const [history, setHistory] = useState<SalesStatusHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const fetchStatusHistory = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from('sales_status_history')
          .select('*')
          .eq('sale_id', saleId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setHistory(data || []);
      } catch (err: any) {
        console.error('Error fetching sales status history:', err);
        setError('Error loading status history');
      } finally {
        setLoading(false);
      }
    };

    if (saleId) {
      fetchStatusHistory();
    }
  }, [saleId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600"></div>
        <span className="ml-2 text-sm text-gray-600">Loading history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'accepted': 'Accepted',
      'processing': 'Processing',
      'shipped': 'Shipped',
      'delivered': 'Delivered',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'returned': 'Returned'
    };
    return labels[status] || status;
  };

  const visibleHistory = showAll ? history : history.slice(0, 3);
  const currentStepIndex = statusSteps.indexOf(currentStatus);
  const showProgress = currentStepIndex >= 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Current Status */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-3 sm:p-4 border border-blue-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Current Status</p>
            <SalesStatusBadge status={currentStatus} />
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-600">Change History</p>
            <p className="text-xs sm:text-sm font-semibold text-gray-900">{history.length}</p>
          </div>
        </div>
      </div>

      {showProgress && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
            {statusSteps.map((status, index) => {
              const isDone = index <= currentStepIndex;
              const isCurrent = status === currentStatus;
              return (
                <div key={status} className="min-w-0">
                  <div className={`h-1.5 rounded-full ${isDone ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  <p className={`mt-1 truncate text-[10px] sm:text-xs font-semibold ${isCurrent ? 'text-blue-700' : isDone ? 'text-gray-900' : 'text-gray-400'}`}>
                    {getStatusLabel(status)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status History */}
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h4 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center">
            <FaClock className="mr-2 text-gray-600 text-sm" />
            Status Change History
          </h4>
          {history.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <span>{showAll ? 'Hide' : 'Show All'}</span>
              {showAll ? <FaChevronUp className="text-xs" /> : <FaChevronDown className="text-xs" />}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {history.length > 0 || saleCreatedAt ? (
            <>
              {visibleHistory.map((item, index) => (
                <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3 hover:border-gray-300 transition-colors">
                  <div className="flex items-start space-x-2 sm:space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                        index === 0 ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <FaClock className={`text-xs ${index === 0 ? 'text-blue-600' : 'text-gray-600'}`} />
                      </div>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1 sm:gap-2 mb-1 sm:mb-2">
                        {item.old_status ? (
                          <>
                            <span className="text-xs font-medium text-gray-500">{getStatusLabel(item.old_status)}</span>
                            <span className="text-gray-400 text-xs">→</span>
                          </>
                        ) : (
                          <span className="text-xs text-gray-500">Start</span>
                        )}
                        <SalesStatusBadge status={item.new_status} className="text-xs" />
                      </div>
                      
                      <div className="flex items-center space-x-1 sm:space-x-2 text-xs text-gray-600 mb-1">
                        <FaClock className="text-gray-400 text-xs" />
                        <span>{formatDate(item.created_at)}</span>
                        {item.changed_by && (
                          <>
                            <FaUser className="text-gray-400 text-xs ml-2" />
                            <span className="truncate">{item.changed_by}</span>
                          </>
                        )}
                      </div>
                      
                      {item.notes && (
                        <div className="mt-1 sm:mt-2 p-1.5 sm:p-2 bg-gray-50 rounded border border-gray-100">
                          <div className="flex items-start space-x-1 sm:space-x-2">
                            <FaStickyNote className="text-gray-400 text-xs mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-gray-700 break-words">{item.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {saleCreatedAt && (showAll || history.length <= 3) && (
                <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-3">
                  <div className="flex items-start space-x-2 sm:space-x-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <FaClock className="text-xs text-emerald-700" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center flex-wrap gap-1 sm:gap-2">
                        <span className="text-xs font-medium text-gray-500">Start</span>
                        <span className="text-gray-400 text-xs">→</span>
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Sale created
                        </span>
                      </div>
                      <div className="flex items-center space-x-1 text-xs text-gray-600">
                        <FaClock className="text-gray-400 text-xs" />
                        <span>{formatDate(saleCreatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {!showAll && history.length > 3 && (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-500">
                    +{history.length - 3} more changes
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4 sm:py-6 bg-gray-50 rounded-lg border border-gray-200">
              <FaClock className="mx-auto text-gray-400 text-lg sm:text-xl mb-2" />
              <p className="text-xs sm:text-sm text-gray-500">No change history yet</p>
              <p className="text-xs text-gray-400 mt-1">History will be created when status changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
