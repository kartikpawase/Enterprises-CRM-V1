import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { SplashScreenCoordinator } from './App';
import { AuthProvider } from './providers/AuthBoundary';
import { apiClient } from './lib/api-client';
import {
  isCrmReadySignaled,
  isSplashScreenDismissed,
  resetSplashScreenStateForTests,
} from './lib/splashScreen';

vi.mock('./lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('SplashScreenCoordinator React Integration Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSplashScreenStateForTests();
    document.body.innerHTML = `
      <div id="crm-splash-screen" role="status">
        <div class="crm-splash-container">
          <div class="crm-splash-logo-wrapper">
            <img id="crm-splash-logo" src="/crm-logo.png" alt="Enterprises CRM" />
          </div>
          <div id="crm-splash-title" class="crm-splash-title">Enterprises <span class="crm-splash-title-crm">CRM</span></div>
          <div class="crm-splash-tagline">Manage · Grow · Succeed Together</div>
          <div class="crm-splash-loader-bar">
            <div id="crm-splash-progress" class="crm-splash-progress-fill" style="width: 25%;"></div>
          </div>
          <div class="crm-splash-text">Loading your CRM...</div>
          <div class="crm-splash-subtext">Building better business relationships</div>
        </div>
        <div class="crm-splash-footer">Developed by Kartik & Siddharth</div>
      </div>
      <div id="root"></div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('detects CRM readiness once initial auth check completes and waits 2s before fade-out', async () => {
    (apiClient.get as any).mockResolvedValueOnce({
      success: true,
      data: {
        user: {
          id: 'user-001',
          username: 'admin',
          displayName: 'Shailendra Rajput',
          role: 'Super Admin',
        },
        permissions: ['*'],
      },
    });

    render(
      <AuthProvider>
        <SplashScreenCoordinator />
      </AuthProvider>
    );

    // Initial auth request is in flight
    expect(isCrmReadySignaled()).toBe(false);

    // Let the mocked promise resolve and React state updates flush
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(50);
    });

    // CRM ready has been signaled
    expect(isCrmReadySignaled()).toBe(true);

    const splash = document.getElementById('crm-splash-screen');
    expect(splash).not.toBeNull();

    // At 1.5s (1500ms), splash must still be visible and not fading
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(splash?.classList.contains('crm-splash-fade-out')).toBe(false);

    // At 2.0s (additional 500ms), fade-out begins
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(splash?.classList.contains('crm-splash-fade-out')).toBe(true);

    // After fade-out transition (~650ms), element is removed from DOM
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(isSplashScreenDismissed()).toBe(true);
    expect(document.getElementById('crm-splash-screen')).toBeNull();
  });
});
