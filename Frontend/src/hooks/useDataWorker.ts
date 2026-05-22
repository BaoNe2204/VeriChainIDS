/**
 * Hook to use Web Workers for data processing
 * 
 * useFetchWorker: Fetch data trong worker thread (không block UI)
 * useDataWorker: Process data trong worker thread (không block UI)
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ============================================================================
// FETCH WORKER - Fetch data trong Web Worker
// ============================================================================

export interface FetchWorkerResult {
  data: any;
  raw: any;
  errors: Record<string, any>;
  isLoading: boolean;
  error: string | null;
}

export function useFetchWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, (data: any) => void>>(new Map());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/dataFetch.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, data, requestId } = e.data;

      // Worker is ready as soon as the message handler is set up
      setIsReady(true);

      const callback = pendingRef.current.get(requestId);
      if (callback) {
        callback(data);
        pendingRef.current.delete(requestId);
      }
    };

    workerRef.current.onerror = (e) => {
      console.error('[FetchWorker] Error:', e);
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const fetchDashboard = useCallback((apiUrl: string, token?: string): Promise<FetchWorkerResult> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ data: null, raw: null, errors: {}, isLoading: false, error: 'Worker not ready' });
        return;
      }

      const requestId = `dashboard-${Date.now()}`;
      pendingRef.current.set(requestId, (data) => {
        resolve({
          data: data.processed,
          raw: data.raw,
          errors: data.errors || {},
          isLoading: false,
          error: Object.keys(data.errors || {}).length > 0 ? 'Some requests failed' : null,
        });
      });

      workerRef.current.postMessage({
        type: 'FETCH_DASHBOARD_BATCH',
        payload: { apiUrl, token },
        requestId,
      });
    });
  }, []);

  const fetchMultiple = useCallback((
    requests: Array<{ endpoint: string; method?: string; body?: any }>,
    apiUrl: string,
    token?: string,
    concurrency = 4
  ): Promise<Record<string, any>> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({});
        return;
      }

      const requestId = `multi-${Date.now()}`;
      pendingRef.current.set(requestId, (data) => {
        resolve(data);
      });

      workerRef.current.postMessage({
        type: 'FETCH_ALL',
        payload: { requests, concurrency, apiUrl, token },
        requestId,
      });
    });
  }, []);

  return {
    fetchDashboard,
    fetchMultiple,
    isReady,
  };
}

// ============================================================================
// DATA WORKER - Process data trong Web Worker
// ============================================================================

export function useDataWorker() {
  const workerRef = useRef<Worker | null>(null);
  const callbacksRef = useRef<Map<string, (data: any) => void>>(new Map());

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/dataProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, data } = e.data;
      const callback = callbacksRef.current.get(type);
      if (callback) {
        callback(data);
        callbacksRef.current.delete(type);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const processDashboardData = useCallback((data: any): Promise<any> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve(data);
        return;
      }

      callbacksRef.current.set('DASHBOARD_PROCESSED', resolve);
      workerRef.current.postMessage({ type: 'PROCESS_DASHBOARD_DATA', data });
    });
  }, []);

  const processAlerts = useCallback((data: any[]): Promise<any[]> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve(data);
        return;
      }

      callbacksRef.current.set('ALERTS_PROCESSED', resolve);
      workerRef.current.postMessage({ type: 'PROCESS_ALERTS', data });
    });
  }, []);

  const processTrafficData = useCallback((data: any[]): Promise<any[]> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve(data);
        return;
      }

      callbacksRef.current.set('TRAFFIC_PROCESSED', resolve);
      workerRef.current.postMessage({ type: 'PROCESS_TRAFFIC_DATA', data });
    });
  }, []);

  return {
    processDashboardData,
    processAlerts,
    processTrafficData,
  };
}
