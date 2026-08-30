import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  Integration,
  EffectiveMappingResult,
  FieldMapping,
  CanonicalField,
  MappingVersion,
  MappingPreviewResponse,
  CanonicalOrder
} from '../../../core/models/types';

@Component({
  selector: 'app-dynamic-mapping',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-body space-y-5">
      <!-- Breadcrumb Navigation -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <a routerLink="/integrations" class="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
            <span>🔌</span> Conexiones & Integraciones
          </a>
          <span>/</span>
          <span class="text-slate-200 font-semibold">Mapeo Dinámico de Campos</span>
          <span *ngIf="integration">({{ integration.name }})</span>
        </div>

        <a routerLink="/integrations" class="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs">
          <span>⬅️</span> Volver a Integraciones
        </a>
      </div>

      <!-- Main Header & Action Toolbar -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div class="flex items-center gap-3">
            <span class="text-2xl p-2 bg-indigo-950 rounded-lg border border-indigo-500/30">🗺️</span>
            <div>
              <h3 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Mapeo Dinámico: {{ mappingResult()?.integration_name || integration?.name || 'Tienda' }}
                <span class="badge badge-primary text-[10px] uppercase font-mono">{{ integration?.provider || mappingResult()?.provider || 'WOOCOMMERCE' }}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Asocia directamente cada ruta y valor de la tienda con los campos del pedido estandarizado.
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center flex-wrap gap-2.5">
          <!-- Quick Version Selector Dropdown -->
          <div *ngIf="versions().length > 0" class="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-lg shadow-sm">
            <span class="text-xs text-indigo-400 font-bold">Versión:</span>
            <select [ngModel]="mappingResult()?.current_version"
                    (ngModelChange)="onQuickVersionChange($event)"
                    class="form-select text-xs py-0.5 px-2 bg-slate-900 border-slate-700 text-slate-100 rounded font-mono font-bold focus:border-indigo-500">
              <option *ngFor="let v of versions()" [value]="v.version">
                v{{ v.version }} {{ v.version === mappingResult()?.current_version ? '(ACTUAL)' : '' }} - {{ v.description || 'Configuración' }}
              </option>
            </select>
          </div>

          <button (click)="saveAllMappings()" [disabled]="savingMappings()" class="btn btn-success btn-sm flex items-center gap-1.5 px-4 py-2 font-bold shadow-sm">
            <span>💾</span> {{ savingMappings() ? 'Guardando...' : 'Guardar Mapeo' }}
          </button>
          <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-primary btn-sm flex items-center gap-1.5 px-4 py-2 font-semibold shadow-sm">
            <span>📥</span> {{ loadingSample() ? 'Consultando API...' : 'Obtener Pedido en Vivo' }}
          </button>
          <button (click)="runValidationTest()" [disabled]="testingMapping() || !samplePayload" class="btn btn-secondary btn-sm flex items-center gap-1.5 px-4 py-2">
            <span>⚡</span> {{ testingMapping() ? 'Probando...' : 'Probar Pedido Canónico' }}
          </button>
          <button (click)="openVersionModal()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>🕒</span> Historial ({{ versions().length }})
          </button>
        </div>
      </div>

      <!-- Live Test Result Matrix Table (Appears when user clicks 'Probar Pedido Canónico') -->
      <div *ngIf="previewResult && previewResult.canonical_order" class="bg-slate-900 border-2 border-indigo-500/40 rounded-xl overflow-hidden shadow-lg space-y-0">
        <!-- Header banner -->
        <div class="p-4 bg-slate-950 border-b border-indigo-500/30 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">🔬</span>
            <div>
              <h4 class="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Resultado de Prueba: Matriz de Pedido Estandarizado Canónico</span>
                <span class="badge badge-success text-[10px] font-mono">PEDIDO #{{ previewResult.canonical_order.order_number }}</span>
              </h4>
              <p class="text-xs text-slate-400">Valores consolidados resultantes de tus reglas de mapeo actuales</p>
            </div>
          </div>
          <button (click)="previewResult = null" class="btn btn-secondary btn-sm text-xs py-1 px-2.5 text-slate-300 hover:text-white">
            ✕ Ocultar Matriz de Prueba
          </button>
        </div>

        <!-- Matrix Table of Standardized Fields -->
        <div class="table-container border-0 rounded-none bg-transparent">
          <table class="w-full text-left" style="background-color: #0b1120;">
            <thead style="background-color: #0f172a; border-bottom: 1px solid #1e293b;">
              <tr>
                <th class="p-3 font-bold uppercase text-xs text-indigo-300 w-1/4">1. Campo Canónico Estandarizado</th>
                <th class="p-3 font-bold uppercase text-xs text-emerald-400 w-1/2">2. Valor Extraído & Mapeado</th>
                <th class="p-3 font-bold uppercase text-xs text-amber-300 w-1/4">3. Estado de Validación</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 text-xs font-mono">
              <!-- Nº Pedido -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">order.order_number (Nº Pedido)</td>
                <td class="p-3 text-emerald-400 font-bold text-sm">#{{ previewResult.canonical_order.order_number }}</td>
                <td class="p-3"><span class="badge badge-success text-[10px]">✓ VÁLIDO</span></td>
              </tr>
              <!-- Estado -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">order.status (Estado)</td>
                <td class="p-3 text-indigo-300 font-bold">{{ previewResult.canonical_order.status }}</td>
                <td class="p-3"><span class="badge badge-success text-[10px]">✓ VÁLIDO</span></td>
              </tr>
              <!-- Total -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">order.total & currency (Total)</td>
                <td class="p-3 text-amber-400 font-bold text-sm">\${{ previewResult.canonical_order.total | number }} {{ previewResult.canonical_order.currency }}</td>
                <td class="p-3"><span class="badge badge-success text-[10px]">✓ VÁLIDO</span></td>
              </tr>
              <!-- Cliente -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">customer.name (Cliente)</td>
                <td class="p-3 text-slate-200">{{ previewResult.canonical_order.customer.name || '(Sin nombre)' }}</td>
                <td class="p-3">
                  <span class="badge" [ngClass]="previewResult.canonical_order.customer.name ? 'badge-success' : 'badge-warning'">
                    {{ previewResult.canonical_order.customer.name ? '✓ ASIGNADO' : '⚠️ VACÍO' }}
                  </span>
                </td>
              </tr>
              <!-- Email -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">customer.email (Email)</td>
                <td class="p-3 text-indigo-300">{{ previewResult.canonical_order.customer.email || '(Sin email)' }}</td>
                <td class="p-3">
                  <span class="badge" [ngClass]="previewResult.canonical_order.customer.email ? 'badge-success' : 'badge-warning'">
                    {{ previewResult.canonical_order.customer.email ? '✓ ASIGNADO' : '⚠️ VACÍO' }}
                  </span>
                </td>
              </tr>
              <!-- Teléfono -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">customer.phone (Teléfono)</td>
                <td class="p-3 text-slate-300">{{ previewResult.canonical_order.customer.phone || '(Sin teléfono)' }}</td>
                <td class="p-3">
                  <span class="badge" [ngClass]="previewResult.canonical_order.customer.phone ? 'badge-success' : 'badge-warning'">
                    {{ previewResult.canonical_order.customer.phone ? '✓ ASIGNADO' : '⚠️ VACÍO' }}
                  </span>
                </td>
              </tr>
              <!-- Dirección -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">delivery.address (Dirección)</td>
                <td class="p-3 text-emerald-300">{{ previewResult.canonical_order.delivery.address || '(Sin dirección)' }}</td>
                <td class="p-3">
                  <span class="badge" [ngClass]="previewResult.canonical_order.delivery.address ? 'badge-success' : 'badge-warning'">
                    {{ previewResult.canonical_order.delivery.address ? '✓ ASIGNADO' : '⚠️ VACÍO' }}
                  </span>
                </td>
              </tr>
              <!-- Comuna & Ciudad -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">delivery.city / commune (Comuna)</td>
                <td class="p-3 text-amber-300 font-bold">
                  {{ previewResult.canonical_order.delivery.city }}
                  <span *ngIf="previewResult.canonical_order.delivery.region" class="text-slate-400 font-normal">({{ previewResult.canonical_order.delivery.region }}, {{ previewResult.canonical_order.delivery.country }})</span>
                </td>
                <td class="p-3">
                  <span class="badge" [ngClass]="previewResult.canonical_order.delivery.city ? 'badge-success' : 'badge-warning'">
                    {{ previewResult.canonical_order.delivery.city ? '✓ ASIGNADO' : '⚠️ VACÍO' }}
                  </span>
                </td>
              </tr>
              <!-- Items / SKUs -->
              <tr class="hover:bg-slate-900/50">
                <td class="p-3 font-bold text-slate-300">items[] (Detalle de Productos)</td>
                <td class="p-3 text-slate-300" colspan="2">
                  <div *ngFor="let item of previewResult.canonical_order.items; let i = index" class="p-2 bg-slate-950 rounded border border-slate-800 mb-1.5 flex items-center justify-between gap-2">
                    <div>
                      <span class="text-purple-400 font-bold">SKU: {{ item.sku }}</span> &nbsp;•&nbsp;
                      <span class="text-slate-200">{{ item.description }}</span>
                    </div>
                    <div class="text-right">
                      <span class="text-emerald-400 font-bold">Cant: {{ item.quantity }}</span> &nbsp;•&nbsp;
                      <span class="text-amber-400 font-bold">\${{ item.total | number }}</span>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- MAIN 3-COLUMN MAPPING MATRIX -->
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <!-- Matrix Toolbar / Search -->
        <div class="p-4 border-b border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-3 flex-1">
            <input type="text"
                   [(ngModel)]="searchQuery"
                   placeholder="🔍 Buscar por ruta de API o valor (ej: custom, address, phone, price)..."
                   class="form-control text-xs py-2 px-3 bg-slate-900 border-slate-800 text-slate-100 rounded-lg w-full max-w-md" />
            <span class="text-xs text-slate-400 font-mono">
              {{ filteredKeys().length }} de {{ flattenedSampleKeys.length }} rutas
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="badge badge-success text-[11px] font-mono">
              {{ activeMappings().length }} reglas activas
            </span>
          </div>
        </div>

        <!-- When sample is loaded: Matrix Table -->
        <div *ngIf="samplePayload" class="table-container border-0 rounded-none bg-transparent max-h-[70vh] overflow-y-auto">
          <table class="w-full text-left" style="background-color: #0b1120; color: #f8fafc;">
            <thead class="sticky top-0 z-10" style="background-color: #0f172a; border-bottom: 1px solid #1e293b;">
              <tr>
                <th class="w-1/3 p-3.5 font-bold uppercase text-xs text-indigo-300">
                  1. Ruta / Dato que da la API (Source Path)
                </th>
                <th class="w-1/3 p-3.5 font-bold uppercase text-xs text-emerald-400">
                  2. Valor que envía en esa Ruta
                </th>
                <th class="w-1/3 p-3.5 font-bold uppercase text-xs text-amber-300">
                  3. Asociar a Campo Estandarizado (Objetivo)
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 font-mono text-xs">
              <tr *ngFor="let item of filteredKeys()" class="hover:bg-slate-900/60 transition" style="border-bottom: 1px solid #1e293b;">
                <!-- Columna 1: Ruta de la API -->
                <td class="p-3.5 align-middle">
                  <span class="text-indigo-300 font-bold bg-slate-900 px-2.5 py-1.5 rounded border border-indigo-500/30 inline-block">
                    {{ item.path }}
                  </span>
                </td>

                <!-- Columna 2: Valor que viene en esa ruta -->
                <td class="p-3.5 align-middle text-emerald-400 font-semibold break-all bg-slate-950/50">
                  {{ item.value }}
                </td>

                <!-- Columna 3: Selector de Campo Estandarizado -->
                <td class="p-3.5 align-middle font-sans">
                  <div class="space-y-1.5">
                    <div class="flex items-center gap-2">
                      <select [(ngModel)]="sampleKeyAssignments[item.path]"
                              (change)="assignSampleKeyToCanonical(item.path)"
                              class="form-select text-xs py-1.5 px-3 bg-slate-900 border border-slate-700 text-slate-100 rounded w-full focus:border-indigo-500">
                        <option value="">(Sin asociar / Dejar en blanco)</option>
                        <optgroup label="📦 Datos del Pedido">
                          <option value="order.order_number">order.order_number (Nº de Pedido)</option>
                          <option value="order.id">order.id (ID Externo)</option>
                          <option value="order.status">order.status (Estado del Pedido)</option>
                          <option value="order.total">order.total (Monto Total)</option>
                          <option value="order.currency">order.currency (Moneda)</option>
                          <option value="order.created_at">order.created_at (Fecha de Creación)</option>
                        </optgroup>
                        <optgroup label="👤 Datos del Cliente">
                          <option value="customer.name">customer.name (Nombre del Cliente)</option>
                          <option value="customer.email">customer.email (Email de Contacto)</option>
                          <option value="customer.phone">customer.phone (Teléfono)</option>
                          <option value="customer.id">customer.id (RUT / Identificador)</option>
                        </optgroup>
                        <optgroup label="📍 Despacho y Ubicación">
                          <option value="delivery.address">delivery.address (Dirección de Despacho)</option>
                          <option value="delivery.city">delivery.city (Ciudad de Entrega)</option>
                          <option value="delivery.commune">delivery.commune (Comuna Específica)</option>
                          <option value="delivery.region">delivery.region (Región / Estado)</option>
                          <option value="delivery.country">delivery.country (País)</option>
                          <option value="delivery.postal_code">delivery.postal_code (Código Postal)</option>
                        </optgroup>
                        <optgroup label="🛒 Productos / Ítems">
                          <option value="items[].sku">items[].sku (SKU del Producto)</option>
                          <option value="items[].description">items[].description (Nombre/Descripción)</option>
                          <option value="items[].quantity">items[].quantity (Cantidad)</option>
                          <option value="items[].unit_price">items[].unit_price (Precio Unitario)</option>
                          <option value="items[].total">items[].total (Total de Línea)</option>
                        </optgroup>
                      </select>
                      <button (click)="assignSampleKeyToCanonical(item.path)"
                              class="btn btn-primary btn-sm text-xs py-1.5 px-3 font-semibold whitespace-nowrap shadow-sm"
                              title="Guardar o actualizar asociación">
                        ⚡ Asociar
                      </button>
                      <button *ngIf="getAssignedCanonicalForPath(item.path)"
                              (click)="clearSampleKeyAssignment(item.path)"
                              class="btn btn-secondary btn-sm text-xs py-1.5 px-2 text-slate-400 hover:text-red-400"
                              title="Quitar asociación y dejar en blanco">
                        ✕
                      </button>
                    </div>
                    <div *ngIf="getAssignedCanonicalForPath(item.path)" class="text-[11px] text-emerald-400 flex items-center gap-1 font-sans">
                      <span>✅ Asociado a:</span> <strong class="font-mono text-indigo-300">{{ getAssignedCanonicalForPath(item.path) }}</strong>
                    </div>
                    <div *ngIf="!getAssignedCanonicalForPath(item.path)" class="text-[11px] text-slate-500 italic font-sans">
                      (Campo no asociado / En blanco)
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- When no sample is loaded yet -->
        <div *ngIf="!samplePayload" class="p-12 text-center space-y-4">
          <div class="text-4xl">📥</div>
          <div class="text-base font-bold text-slate-200">Sin pedido de prueba cargado</div>
          <p class="text-xs text-slate-400 max-w-md mx-auto">
            Haz clic en "Obtener Pedido en Vivo" para consultar la API de la tienda y mapear visualmente todas sus rutas y datos.
          </p>
          <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-primary btn-sm px-4 py-2 font-semibold">
            ⚡ {{ loadingSample() ? 'Consultando API...' : 'Obtener Pedido en Vivo del Proveedor' }}
          </button>
        </div>
      </div>

      <!-- Historical Versions Modal -->
      <div *ngIf="showVersionModal" class="modal-overlay">
        <div class="modal-container max-w-xl">
          <div class="modal-header">
            <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>🕒</span> Historial de Versiones de Mapeo
            </h3>
            <button (click)="showVersionModal = false" class="text-slate-400 hover:text-slate-200 text-lg">✕</button>
          </div>

          <div class="modal-body space-y-3">
            <p class="text-xs text-slate-400">
              Selecciona cualquier versión anterior para restaurar instantáneamente todas sus reglas de mapeo:
            </p>

            <div *ngFor="let v of versions()"
                 class="p-3.5 rounded-xl border transition flex items-center justify-between gap-4"
                 [ngClass]="v.version === mappingResult()?.current_version ? 'bg-indigo-950/40 border-indigo-500/60 ring-1 ring-indigo-500/40' : 'bg-slate-950 border-slate-800 hover:border-slate-700'">
              <div>
                <div class="font-bold text-slate-100 flex items-center gap-2 text-sm">
                  <span>Versión {{ v.version }}</span>
                  <span *ngIf="v.version === mappingResult()?.current_version" class="badge badge-primary text-[10px] font-bold">
                    ✓ EN USO ACTUALMENTE
                  </span>
                </div>
                <div class="text-slate-300 text-xs mt-1">{{ v.description || 'Configuración guardada' }}</div>
                <div class="text-[11px] text-slate-500 mt-0.5 font-mono">
                  📅 {{ v.created_at | date:'dd/MM/yyyy HH:mm:ss' }} &nbsp;•&nbsp; 👤 {{ v.created_by }}
                </div>
              </div>

              <div>
                <button *ngIf="v.version !== mappingResult()?.current_version"
                        (click)="restoreVersion(v.version)"
                        class="btn btn-primary btn-sm text-xs font-bold px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
                  <span>⏪</span> Restaurar esta versión
                </button>
                <span *ngIf="v.version === mappingResult()?.current_version" class="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <span>🟢</span> Activa
                </span>
              </div>
            </div>

            <div *ngIf="versions().length === 0" class="text-center py-6 text-slate-500 text-xs">
              No hay versiones históricas registradas
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="showVersionModal = false" class="btn btn-secondary btn-sm">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(15, 23, 42, 0.8) !important;
      backdrop-filter: blur(6px) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      z-index: 99999 !important;
      padding: 1.5rem !important;
    }
    .modal-container {
      background: #0f172a !important;
      border-radius: 16px !important;
      width: 100% !important;
      max-height: 88vh !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7) !important;
      overflow: hidden !important;
      border: 1px solid #334155 !important;
      color: #f8fafc !important;
    }
    .modal-header {
      padding: 1.25rem 1.5rem !important;
      border-bottom: 1px solid #1e293b !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: #1e293b !important;
      flex-shrink: 0 !important;
    }
    .modal-body {
      padding: 1.5rem !important;
      overflow-y: auto !important;
      flex: 1 !important;
      background: #0f172a !important;
    }
    .modal-footer {
      padding: 1rem 1.5rem !important;
      border-top: 1px solid #1e293b !important;
      display: flex !important;
      justify-content: flex-end !important;
      align-items: center !important;
      background: #1e293b !important;
      flex-shrink: 0 !important;
    }
  `]
})
export class DynamicMappingComponent implements OnInit {
  @Input() integration?: Integration;
  @Output() close = new EventEmitter<void>();

  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  public auth = inject(AuthService);

  mappingResult = signal<EffectiveMappingResult | null>(null);
  canonicalFields = signal<CanonicalField[]>([]);
  versions = signal<MappingVersion[]>([]);
  activeMappings = signal<FieldMapping[]>([]);

  samplePayload: any = null;
  flattenedSampleKeys: Array<{ path: string; value: string }> = [];
  sampleKeyAssignments: { [sourcePath: string]: string } = {};

  searchQuery = '';
  loadingSample = signal<boolean>(false);
  testingMapping = signal<boolean>(false);
  savingMappings = signal<boolean>(false);

  previewResult: MappingPreviewResponse | null = null;
  showVersionModal = false;

  get integrationId(): string {
    return this.integration?.id || this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit() {
    const id = this.integrationId;
    if (id && !this.integration) {
      this.api.getIntegrations().subscribe({
        next: (list) => {
          const found = list.find(i => i.id === id);
          if (found) {
            this.integration = found;
          }
          this.loadData();
        }
      });
    } else if (this.integration) {
      this.loadData();
    }
  }

  loadData() {
    if (!this.integrationId) return;
    this.loadEffectiveMapping();
    this.loadCanonicalFields();
    this.loadVersions();
  }

  loadEffectiveMapping() {
    this.api.getIntegrationMapping(this.integrationId).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings || []);
        if (res.latest_sample) {
          this.samplePayload = res.latest_sample;
          this.flattenSample(res.latest_sample);
        } else {
          // Auto fetch sample if not present
          this.fetchSampleOrder();
        }
      },
      error: () => this.toast.error('Error cargando configuración de mapeo')
    });
  }

  loadCanonicalFields() {
    this.api.getCanonicalFields().subscribe({
      next: (fields) => this.canonicalFields.set(fields),
      error: () => this.toast.error('Error cargando campos canónicos')
    });
  }

  loadVersions() {
    this.api.getMappingVersions(this.integrationId).subscribe({
      next: (v) => this.versions.set(v),
      error: () => {}
    });
  }

  fetchSampleOrder() {
    this.loadingSample.set(true);
    this.api.fetchSampleOrderPayload(this.integrationId).subscribe({
      next: (res) => {
        this.loadingSample.set(false);
        this.samplePayload = res.raw_payload;
        this.flattenSample(res.raw_payload);
        this.toast.success('Pedido de muestra obtenido correctamente de la tienda');
      },
      error: (err) => {
        this.loadingSample.set(false);
        this.toast.error('Error al recuperar muestra: ' + (err.error?.error || err.message));
      }
    });
  }

  flattenSample(obj: any) {
    const list: Array<{ path: string; value: string }> = [];
    const recurse = (prefix: string, o: any) => {
      if (!o && o !== 0 && o !== false) return;
      if (typeof o === 'object' && !Array.isArray(o)) {
        for (const k of Object.keys(o)) {
          const p = prefix ? `${prefix}.${k}` : k;
          recurse(p, o[k]);
        }
      } else if (Array.isArray(o)) {
        if (o.length > 0) {
          const arrayP = `${prefix}[]`;
          if (typeof o[0] === 'object') {
            for (const k of Object.keys(o[0])) {
              recurse(`${prefix}[].${k}`, o[0][k]);
            }
          } else {
            list.push({ path: arrayP, value: JSON.stringify(o) });
          }
        }
      } else {
        list.push({ path: prefix, value: String(o) });
      }
    };
    recurse('', obj);
    this.flattenedSampleKeys = list;

    // Pre-populate assignments from active mappings
    this.sampleKeyAssignments = {};
    this.activeMappings().forEach(m => {
      if (m.source_path) {
        this.sampleKeyAssignments[m.source_path] = m.canonical_field;
      }
    });
  }

  filteredKeys(): Array<{ path: string; value: string }> {
    if (!this.searchQuery) return this.flattenedSampleKeys;
    const q = this.searchQuery.toLowerCase();
    return this.flattenedSampleKeys.filter(
      item => item.path.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
    );
  }

  getAssignedCanonicalForPath(path: string): string {
    const found = this.activeMappings().find(m => m.source_path === path);
    return found ? found.canonical_field : '';
  }

  saveAllMappings() {
    this.savingMappings.set(true);
    const mappings: FieldMapping[] = [];

    for (const [path, canonicalField] of Object.entries(this.sampleKeyAssignments)) {
      if (canonicalField && canonicalField.trim() !== '') {
        mappings.push({
          canonical_field: canonicalField,
          source_path: path,
          transformation: 'COPY',
          data_type: 'STRING',
          mapping_type: 'OVERRIDE',
          required: true,
          default_value: '',
          enabled: true
        });
      }
    }

    this.api.saveIntegrationMapping(this.integrationId, mappings).subscribe({
      next: (res) => {
        this.savingMappings.set(false);
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.toast.success(`✅ ${mappings.length} reglas de mapeo guardadas exitosamente`);
        this.loadVersions();
      },
      error: (err) => {
        this.savingMappings.set(false);
        this.toast.error('Error guardando mapeos: ' + (err.error?.error || err.message));
      }
    });
  }

  assignSampleKeyToCanonical(path: string) {
    const canonicalField = this.sampleKeyAssignments[path];

    if (!canonicalField || canonicalField === '') {
      this.clearSampleKeyAssignment(path);
      return;
    }

    const mappings = [...this.activeMappings()];
    const idx = mappings.findIndex(m => m.canonical_field === canonicalField);
    const newRule: FieldMapping = {
      canonical_field: canonicalField,
      source_path: path,
      transformation: 'COPY',
      data_type: 'STRING',
      mapping_type: 'OVERRIDE',
      required: true,
      default_value: '',
      enabled: true
    };

    if (idx >= 0) {
      mappings[idx] = newRule;
    } else {
      mappings.push(newRule);
    }

    this.api.saveIntegrationMapping(this.integrationId, mappings).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.toast.success(`✅ ${canonicalField} asignado a ${path}`);
        this.loadVersions();
      },
      error: (err) => this.toast.error('Error guardando mapeo: ' + (err.error?.error || err.message))
    });
  }

  clearSampleKeyAssignment(path: string) {
    this.sampleKeyAssignments[path] = '';
    const currentMappings = this.activeMappings();
    const updated = currentMappings.filter(m => m.source_path !== path);

    this.api.saveIntegrationMapping(this.integrationId, updated).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.toast.info(`Ruta ${path} desasociada`);
        this.loadVersions();
      },
      error: (err) => this.toast.error('Error al desasociar: ' + (err.error?.error || err.message))
    });
  }

  runValidationTest() {
    this.testingMapping.set(true);
    this.api.testIntegrationMapping(this.integrationId, this.activeMappings()).subscribe({
      next: (res) => {
        this.testingMapping.set(false);
        this.previewResult = res;
        if (res.success) {
          this.toast.success('Prueba exitosa. Pedido canónico construido correctamente.');
        } else {
          this.toast.error('Prueba completada con observaciones.');
        }
      },
      error: (err) => {
        this.testingMapping.set(false);
        this.toast.error('Error en prueba: ' + (err.error?.error || err.message));
      }
    });
  }

  openVersionModal() {
    this.loadVersions();
    this.showVersionModal = true;
  }

  onQuickVersionChange(version: number | string) {
    const vNum = Number(version);
    if (!vNum || vNum === this.mappingResult()?.current_version) return;
    this.restoreVersion(vNum);
  }

  restoreVersion(version: number) {
    this.api.restoreMappingVersion(this.integrationId, version).subscribe({
      next: (res: EffectiveMappingResult) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.showVersionModal = false;
        this.toast.success(`Versión v${version} activada y restaurada exitosamente`);
        if (this.samplePayload) {
          this.flattenSample(this.samplePayload);
        }
      },
      error: (err: any) => this.toast.error('Error restaurando versión: ' + (err.error?.error || err.message))
    });
  }
}
