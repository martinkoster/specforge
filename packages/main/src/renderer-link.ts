// SPDX-License-Identifier: Apache-2.0
// Link from the core supervisor to the renderer page: the core starts together with the window (NFR-003), so its
// status and MessagePort are held until the page has loaded and can receive them.

export interface RendererLinkOptions<Port> {
  postPort(port: Port): void;
  sendStatus(status: string): void;
}

export class RendererLink<Port> {
  private isLoaded = false;
  private pendingStatus: string | undefined;
  private pendingPort: Port | undefined;

  constructor(private readonly options: RendererLinkOptions<Port>) {}

  /** The page finished loading: deliver what the core reported meanwhile. */
  loaded(): void {
    this.isLoaded = true;
    if (this.pendingStatus !== undefined) this.options.sendStatus(this.pendingStatus);
    if (this.pendingPort !== undefined) this.options.postPort(this.pendingPort);
    this.pendingStatus = undefined;
    this.pendingPort = undefined;
  }

  status(status: string): void {
    if (this.isLoaded) this.options.sendStatus(status);
    else this.pendingStatus = status;
  }

  port(port: Port): void {
    if (this.isLoaded) this.options.postPort(port);
    else this.pendingPort = port;
  }
}
