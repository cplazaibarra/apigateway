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
  AutoMappingSuggestion,
  CanonicalOrder
} from '../../../core/models/types';

@Component({
  selector: 'app-dynamic-mapping',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-body space-y-6">
      <!-- Breadcrumb / Back Navigation -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <a routerLink="/integrations" class="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium">
            <span>🔌</span> Conexiones & Integraciones
          </a>
          <span>/</span>
          <span class="text-slate-200 font-semibold">Mapeo Dinámico de Campos</span>
          <span *ngIf="integration">({{ integration.name }})</span>
        </div>

        <div class="flex items-center gap-2">
          <a routerLink="/integrations" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>⬅️</span> Volver a Integraciones
          </a>
        </div>
      </div>

      <!-- Header Bar with Stats & Actions -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div class="flex items-center gap-3">
            <span class="text-2xl">🗺️</span>
            <div>
              <h3 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Mapeo Dinámico: {{ mappingResult()?.integration_name || integration?.name || 'Cargando...' }}
                <span class="badge badge-primary text-[10px] uppercase font-mono">v{{ mappingResult()?.current_version || 1 }}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Transformación del payload de origen ({{ integration?.provider || mappingResult()?.provider || 'WOOCOMMERCE' }}) al modelo canónico de la plataforma
              </p>
            </div>
          </div>
        </div>

        <div class="flex items-center flex-wrap gap-2.5">
          <button (click)="openWizard()" class="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm">
            <span>✨</span> Asistente (Mapping Wizard)
          </button>
          <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>📥</span> {{ loadingSample() ? 'Consultando...' : 'Obtener Sample Real' }}
          </button>
          <button (click)="runLiveTest()" [disabled]="testingMapping()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>🔍</span> {{ testingMapping() ? 'Probando...' : 'Test & Preview' }}
          </button>
          <button (click)="openVersionHistory()" class="btn btn-secondary btn-sm flex items-center gap-1.5">
            <span>🕒</span> Versiones ({{ versions().length }})
          </button>
          <button *ngIf="close.observed" (click)="close.emit()" class="btn btn-secondary btn-sm">
            <span>✕</span> Cerrar
          </button>
        </div>
      </div>

      <!-- Coverage Summary Bar -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <!-- Coverage Percentage Card -->
        <div class="card bg-slate-900 border-slate-800 p-4 flex items-center justify-between">
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cobertura Total</div>
            <div class="text-2xl font-black text-slate-100 mt-1">
              {{ mappingResult()?.coverage_percent | number:'1.0-0' }}%
            </div>
            <div class="text-[11px] text-slate-500 mt-0.5">Campos configurados</div>
          </div>
          <div class="w-12 h-12 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 flex items-center justify-center font-bold text-xs text-indigo-400">
            {{ mappingResult()?.coverage_percent | number:'1.0-0' }}%
          </div>
        </div>

        <!-- Required Fields Card -->
        <div class="card bg-slate-900 border-slate-800 p-4">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Campos Requeridos</div>
          <div class="text-2xl font-black text-emerald-400 mt-1">
            {{ mappingResult()?.required_mapped }} / {{ mappingResult()?.required_count }}
          </div>
          <div class="text-[11px] text-emerald-500/80 mt-0.5 flex items-center gap-1">
            <span *ngIf="mappingResult()?.required_mapped === mappingResult()?.required_count">✅ Todos los obligatorios cubiertos</span>
            <span *ngIf="(mappingResult()?.required_mapped || 0) < (mappingResult()?.required_count || 0)" class="text-amber-400">⚠️ Faltan campos requeridos</span>
          </div>
        </div>

        <!-- Optional Fields Card -->
        <div class="card bg-slate-900 border-slate-800 p-4">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Campos Opcionales</div>
          <div class="text-2xl font-black text-indigo-400 mt-1">
            {{ mappingResult()?.optional_mapped }} / {{ mappingResult()?.optional_count }}
          </div>
          <div class="text-[11px] text-slate-500 mt-0.5">Enriquecimiento de datos</div>
        </div>

        <!-- Provider Status Card -->
        <div class="card bg-slate-900 border-slate-800 p-4">
          <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Modo de Adaptación</div>
          <div class="text-sm font-bold text-purple-400 mt-1 truncate">
            {{ integration?.provider || mappingResult()?.provider || 'WOOCOMMERCE' }} GENÉRICO
          </div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            {{ overrideCount() }} Overrides Personalizados
          </div>
        </div>
      </div>

      <!-- Main Tabs: Active Mappings, Visual Explorer, Test Preview -->
      <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button (click)="activeTab = 'mappings'" [class.text-indigo-400]="activeTab === 'mappings'" [class.border-b-2]="activeTab === 'mappings'" [class.border-indigo-500]="activeTab === 'mappings'" class="px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 text-slate-300">
          <span>📋</span> Reglas de Mapeo Activas ({{ activeMappings().length }})
        </button>
        <button (click)="activeTab = 'explorer'" [class.text-indigo-400]="activeTab === 'explorer'" [class.border-b-2]="activeTab === 'explorer'" [class.border-indigo-500]="activeTab === 'explorer'" class="px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 text-slate-300">
          <span>🔍</span> Explorador Visual de JSON (Sample)
        </button>
        <button (click)="activeTab = 'preview'" [class.text-indigo-400]="activeTab === 'preview'" [class.border-b-2]="activeTab === 'preview'" [class.border-indigo-500]="activeTab === 'preview'" class="px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 text-slate-300">
          <span>🔬</span> Preview & Resultado Canónico
        </button>
      </div>

      <!-- TAB 1: MAPPINGS TABLE -->
      <div *ngIf="activeTab === 'mappings'" class="space-y-4">
        <!-- Action Row -->
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div class="flex items-center gap-2">
            <input type="text" [(ngModel)]="filterSearch" placeholder="Filtrar campos canónicos o paths..." class="form-control text-xs py-1.5 px-3 w-64 bg-slate-900 border-slate-800" />
            <select [(ngModel)]="filterGroup" class="form-select text-xs py-1.5 px-3 w-auto bg-slate-900 border-slate-800">
              <option value="">Todos los Grupos</option>
              <option value="order">📦 Pedido (order)</option>
              <option value="customer">👤 Cliente (customer)</option>
              <option value="delivery">📍 Entrega (delivery)</option>
              <option value="items">🛒 Productos (items[])</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <button (click)="suggestAutoMappings()" [disabled]="loadingAutoMap()" class="btn btn-secondary btn-sm text-xs flex items-center gap-1.5">
              <span>🪄</span> {{ loadingAutoMap() ? 'Analizando...' : 'Sugerir Auto-Mapping' }}
            </button>
            <button (click)="openAddMappingModal()" class="btn btn-primary btn-sm text-xs flex items-center gap-1.5">
              <span>➕</span> Agregar / Sobrescribir Campo
            </button>
          </div>
        </div>

        <!-- Mappings Table -->
        <div class="card bg-slate-900 border-slate-800 p-0 overflow-hidden shadow-sm">
          <div class="table-container border-0 rounded-none bg-transparent">
            <table>
              <thead>
                <tr>
                  <th>Campo Canónico</th>
                  <th>Ruta Origen (Source Path)</th>
                  <th>Transformación</th>
                  <th>Valor Default</th>
                  <th>Tipo / Req</th>
                  <th>Nivel</th>
                  <th class="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let m of filteredMappings()">
                  <td>
                    <div class="font-mono font-bold text-xs text-slate-200 flex items-center gap-1.5">
                      <span>{{ getGroupIcon(m.canonical_field) }}</span>
                      <span>{{ m.canonical_field }}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 mt-0.5">{{ getCanonicalFieldTitle(m.canonical_field) }}</div>
                  </td>

                  <td>
                    <div *ngIf="m.source_path" class="font-mono text-xs text-indigo-300 bg-slate-950/60 px-2 py-1 rounded border border-slate-800 inline-block">
                      {{ m.source_path }}
                    </div>
                    <div *ngIf="!m.source_path && m.default_value" class="text-xs text-amber-400 italic">
                      (Usa valor por defecto)
                    </div>
                    <div *ngIf="!m.source_path && !m.default_value" class="text-xs text-red-400 italic">
                      ⚠️ No mapeado
                    </div>
                  </td>

                  <td>
                    <span class="code-badge font-bold text-[11px]" [ngClass]="{
                      'text-indigo-400': m.transformation === 'COPY',
                      'text-emerald-400': m.transformation === 'CONCAT',
                      'text-purple-400': m.transformation === 'STATUS_MAP',
                      'text-cyan-400': m.transformation === 'DATE_FORMAT',
                      'text-amber-400': m.transformation === 'NUMBER' || m.transformation === 'DEFAULT'
                    }">
                      {{ m.transformation || 'COPY' }}
                    </span>
                  </td>

                  <td>
                    <span *ngIf="m.default_value" class="font-mono text-xs text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                      "{{ m.default_value }}"
                    </span>
                    <span *ngIf="!m.default_value" class="text-slate-600 text-xs">-</span>
                  </td>

                  <td>
                    <div class="text-xs font-mono text-slate-400">{{ m.data_type }}</div>
                    <span *ngIf="m.required" class="badge badge-danger text-[9px] py-0 px-1 mt-0.5">REQUERIDO</span>
                    <span *ngIf="!m.required" class="text-slate-600 text-[10px]">Opcional</span>
                  </td>

                  <td>
                    <span *ngIf="m.mapping_type === 'OVERRIDE'" class="badge badge-primary text-[10px] py-0.5 px-1.5 font-bold flex items-center gap-1 w-fit">
                      <span>⚡</span> OVERRIDE
                    </span>
                    <span *ngIf="m.mapping_type === 'DEFAULT'" class="badge badge-muted text-[10px] py-0.5 px-1.5 font-mono text-slate-400 w-fit">
                      DEFAULT
                    </span>
                  </td>

                  <td class="text-right space-x-1.5 whitespace-nowrap">
                    <button (click)="openEditRuleModal(m)" class="btn btn-secondary btn-sm text-xs py-1" title="Editar regla">
                      ✏️
                    </button>
                    <button *ngIf="m.mapping_type === 'OVERRIDE'" (click)="deleteOverride(m)" class="btn btn-danger btn-sm text-xs py-1" title="Restaurar a default">
                      ↩️ Reset
                    </button>
                  </td>
                </tr>

                <tr *ngIf="filteredMappings().length === 0">
                  <td colspan="7" class="text-center py-6 text-slate-500 text-xs">
                    No se encontraron campos que coincidan con los filtros
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- TAB 2: VISUAL JSON EXPLORER -->
      <div *ngIf="activeTab === 'explorer'" class="space-y-4">
        <div class="card bg-slate-900 border-slate-800 p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h4 class="text-sm font-bold text-slate-200">🔍 Selector Visual de Campos (Sample Payload)</h4>
              <p class="text-xs text-slate-400">Haz clic en cualquier nodo JSON para asignarlo automáticamente a un campo canónico</p>
            </div>
            <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-secondary btn-sm text-xs">
              🔄 Actualizar Sample
            </button>
          </div>

          <div *ngIf="samplePayload" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <!-- Interactive Tree View -->
            <div class="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs text-slate-300">
              <div class="text-[11px] text-slate-500 uppercase tracking-wider mb-2 font-sans font-bold">Estructura del Payload:</div>
              <div *ngFor="let item of flattenedSampleKeys" (click)="selectPathFromTree(item.path)" class="cursor-pointer py-1 px-2 rounded hover:bg-indigo-950/60 hover:text-indigo-300 transition flex items-center justify-between">
                <span class="font-bold text-slate-200">{{ item.path }}</span>
                <span class="text-slate-500 text-[11px] truncate max-w-xs ml-2">{{ item.value }}</span>
              </div>
            </div>

            <!-- Quick Assign Box -->
            <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
              <h5 class="text-xs font-bold text-slate-200 uppercase tracking-wider">Asignación Rápida de Campo</h5>
              <div>
                <label class="block text-xs text-slate-400 mb-1">Ruta JSON Seleccionada:</label>
                <input type="text" [(ngModel)]="quickAssignPath" placeholder="Haz clic en la lista izquierda o escribe la ruta..." class="form-control text-xs py-1.5 px-3 bg-slate-900 border-slate-800 font-mono" />
              </div>

              <div>
                <label class="block text-xs text-slate-400 mb-1">Asignar al Campo Canónico:</label>
                <select [(ngModel)]="quickAssignCanonical" class="form-select text-xs py-1.5 px-3 bg-slate-900 border-slate-800">
                  <option *ngFor="let cf of canonicalFields()" [value]="cf.id">
                    {{ cf.id }} ({{ cf.name }})
                  </option>
                </select>
              </div>

              <div>
                <label class="block text-xs text-slate-400 mb-1">Transformación:</label>
                <select [(ngModel)]="quickAssignTransform" class="form-select text-xs py-1.5 px-3 bg-slate-900 border-slate-800">
                  <option value="COPY">COPY (Copia directa)</option>
                  <option value="STATUS_MAP">STATUS_MAP (Mapeo de estados)</option>
                  <option value="DATE_FORMAT">DATE_FORMAT (ISO8601)</option>
                  <option value="NUMBER">NUMBER (Decimal)</option>
                  <option value="CONCAT">CONCAT (Combinar campos)</option>
                  <option value="UPPERCASE">UPPERCASE (Mayúsculas)</option>
                  <option value="LOWERCASE">LOWERCASE (Minúsculas)</option>
                </select>
              </div>

              <button (click)="applyQuickAssign()" [disabled]="!quickAssignPath || !quickAssignCanonical" class="btn btn-primary btn-sm w-full text-xs py-2">
                ✅ Guardar Asignación para esta Integración
              </button>
            </div>
          </div>

          <div *ngIf="!samplePayload" class="text-center py-8 text-slate-500 text-xs">
            No se ha obtenido un payload de muestra aún. Haz clic en "Obtener Sample Real" para consultar la tienda.
          </div>
        </div>
      </div>

      <!-- TAB 3: LIVE PREVIEW & RESULT -->
      <div *ngIf="activeTab === 'preview'" class="space-y-5">
        <!-- Test Controller Header -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xl">🔬</span>
              <h4 class="text-base font-bold text-slate-100">Matriz de Verificación y Coherencia de Mapeo</h4>
            </div>
            <p class="text-xs text-slate-400 mt-1">
              Compara directamente cada <strong class="text-slate-200">Campo Estándar</strong> con su <strong class="text-indigo-300">Ruta de Origen</strong> y el <strong class="text-emerald-400">Resultado Obtenido</strong> en la prueba para validar la coherencia de los datos.
            </p>
          </div>
          <button (click)="runLiveTest()" [disabled]="testingMapping()" class="btn btn-primary btn-sm flex items-center gap-2 px-4 py-2 font-semibold shadow-md whitespace-nowrap">
            <span>⚡</span> {{ testingMapping() ? 'Simulando Mapeo...' : 'Re-ejecutar Prueba en Vivo' }}
          </button>
        </div>

        <div *ngIf="previewResult" class="space-y-5">
          <!-- Diagnostics & Warning Alert -->
          <div *ngIf="previewResult.warnings && previewResult.warnings.length > 0" class="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 space-y-2 shadow-sm">
            <div class="font-bold text-xs text-amber-400 flex items-center gap-2">
              <span>⚠️</span> Observaciones del Motor de Mapeo ({{ previewResult.warnings.length }})
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div *ngFor="let w of previewResult.warnings" class="bg-slate-950/60 p-2 rounded border border-amber-500/20 text-amber-200/90 font-mono text-[11px] flex items-start gap-1.5">
                <span class="text-amber-400 font-bold">•</span>
                <div>
                  <span class="font-bold text-amber-300">[{{ w.warning_type }}]</span> {{ w.canonical_field }}: {{ w.message }}
                </div>
              </div>
            </div>
          </div>

          <!-- Quick KPI Cards -->
          <div *ngIf="previewResult.canonical_order" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Nº Pedido</span>
                <div class="text-base font-black text-emerald-400 mt-0.5">#{{ previewResult.canonical_order.order_number }}</div>
              </div>
              <div class="text-lg">📦</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Estado Normalizado</span>
                <div class="text-base font-black text-indigo-400 mt-0.5">{{ previewResult.canonical_order.status }}</div>
              </div>
              <div class="text-lg">🔄</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Facturado</span>
                <div class="text-base font-black text-amber-400 mt-0.5">\${{ previewResult.canonical_order.total | number:'1.0-0' }} {{ previewResult.canonical_order.currency }}</div>
              </div>
              <div class="text-lg">💰</div>
            </div>
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm flex items-center justify-between">
              <div>
                <span class="text-[10px] uppercase font-bold text-slate-500 tracking-wider">SKUs / Líneas</span>
                <div class="text-base font-black text-purple-400 mt-0.5">{{ previewResult.canonical_order.items.length }} Items</div>
              </div>
              <div class="text-lg">🏷️</div>
            </div>
          </div>

          <!-- THE 3-COLUMN COHERENCE VERIFICATION TABLE -->
          <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div class="flex items-center gap-2">
                <span class="text-base">📋</span>
                <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Tabla Comparativa: Estándar vs Origen vs Resultado</span>
              </div>
              <span class="badge badge-primary text-[11px] font-mono">
                {{ getCoherenceRows().length }} campos evaluados
              </span>
            </div>

            <div class="table-container border-0 rounded-none bg-transparent">
              <table>
                <thead>
                  <tr class="bg-slate-950/80">
                    <th class="w-1/3 text-xs uppercase font-bold text-slate-300">
                      1. Campo del Pedido Estandarizado
                    </th>
                    <th class="w-1/3 text-xs uppercase font-bold text-slate-300">
                      2. Origen / Ruta de Búsqueda
                    </th>
                    <th class="w-1/3 text-xs uppercase font-bold text-slate-300">
                      3. Resultado de la Consulta de Prueba
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of getCoherenceRows()" class="border-b border-slate-800/60 hover:bg-slate-800/30 transition">
                    <!-- Column 1: Canonical Field -->
                    <td class="py-3 px-4 align-top">
                      <div class="flex items-center gap-2">
                        <span class="text-sm">{{ row.icon }}</span>
                        <div>
                          <div class="font-mono font-bold text-xs text-slate-100">{{ row.fieldId }}</div>
                          <div class="text-[11px] text-slate-400 mt-0.5">{{ row.fieldName }}</div>
                        </div>
                      </div>
                    </td>

                    <!-- Column 2: Source Path & Transformation -->
                    <td class="py-3 px-4 align-top">
                      <div *ngIf="row.sourcePath" class="space-y-1">
                        <div class="font-mono text-xs text-indigo-300 bg-slate-950 px-2 py-1 rounded border border-indigo-500/20 inline-block font-semibold">
                          {{ row.sourcePath }}
                        </div>
                        <div class="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span class="text-slate-500">Transformación:</span>
                          <span class="code-badge text-[10px] font-bold" [ngClass]="{
                            'text-indigo-400': row.transformation === 'COPY',
                            'text-emerald-400': row.transformation === 'CONCAT',
                            'text-purple-400': row.transformation === 'STATUS_MAP',
                            'text-cyan-400': row.transformation === 'DATE_FORMAT',
                            'text-amber-400': row.transformation === 'NUMBER' || row.transformation === 'DEFAULT'
                          }">
                            {{ row.transformation }}
                          </span>
                          <span *ngIf="row.isOverride" class="badge badge-primary text-[9px] py-0 px-1 font-bold">⚡ OVERRIDE</span>
                        </div>
                      </div>
                      <div *ngIf="!row.sourcePath" class="text-xs text-slate-500 italic">
                        (Sin ruta directa configurada)
                      </div>
                    </td>

                    <!-- Column 3: Test Result Value & Coherence Check -->
                    <td class="py-3 px-4 align-top">
                      <div class="flex items-start justify-between gap-2">
                        <div class="space-y-1 flex-1">
                          <!-- Display value -->
                          <div *ngIf="row.hasValue" class="font-bold text-xs" [ngClass]="{
                            'text-emerald-400': row.isCoherent,
                            'text-slate-200': !row.isCoherent
                          }">
                            {{ row.value }}
                          </div>
                          <div *ngIf="!row.hasValue" class="text-xs text-slate-500 italic">
                            (No obtenido / Vacío)
                          </div>
                          <!-- Detail or subtext -->
                          <div *ngIf="row.detail" class="text-[10px] text-slate-400">
                            {{ row.detail }}
                          </div>
                        </div>

                        <!-- Coherence status pill -->
                        <div class="flex-shrink-0">
                          <span *ngIf="row.hasValue && row.isCoherent" class="badge badge-success text-[10px] flex items-center gap-1">
                            <span>✅</span> Coherente
                          </span>
                          <span *ngIf="row.hasValue && !row.isCoherent" class="badge badge-muted text-[10px]">
                            <span>ℹ️</span> Procesado
                          </span>
                          <span *ngIf="!row.hasValue && row.required" class="badge badge-danger text-[10px] flex items-center gap-1">
                            <span>⚠️</span> Faltante
                          </span>
                          <span *ngIf="!row.hasValue && !row.required" class="badge badge-muted text-[10px]">
                            Opcional
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Items Table Breakdown -->
          <div *ngIf="previewResult.canonical_order && previewResult.canonical_order.items.length > 0" class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div class="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <span class="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <span>🛒</span> Desglose de Productos Canónicos Resultantes
              </span>
              <span class="text-xs text-slate-400 font-mono">{{ previewResult.canonical_order.items.length }} ítems</span>
            </div>

            <div class="table-container border-0 rounded-none bg-transparent">
              <table>
                <thead>
                  <tr class="bg-slate-950/80">
                    <th>SKU Canónico (items[].sku)</th>
                    <th>Descripción / Producto (items[].description)</th>
                    <th class="text-center">Cantidad (items[].quantity)</th>
                    <th class="text-right">Precio Unitario (items[].unit_price)</th>
                    <th class="text-right">Total Línea (items[].total)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let itm of previewResult.canonical_order.items">
                    <td>
                      <span class="code-badge text-purple-300 font-bold text-xs font-mono">{{ itm.sku }}</span>
                    </td>
                    <td>
                      <span class="font-semibold text-slate-200 text-xs">{{ itm.description }}</span>
                    </td>
                    <td class="text-center font-bold text-xs text-slate-100">
                      {{ itm.quantity }}
                    </td>
                    <td class="text-right font-mono text-xs text-slate-300">
                      \${{ itm.unit_price | number:'1.0-0' }}
                    </td>
                    <td class="text-right font-mono font-bold text-xs text-amber-400">
                      \${{ itm.total | number:'1.0-0' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div *ngIf="!previewResult" class="card bg-slate-900 border-slate-800 p-8 text-center space-y-3">
          <div class="text-3xl">🔬</div>
          <div class="text-sm font-bold text-slate-200">Sin simulación ejecutada</div>
          <p class="text-xs text-slate-400 max-w-md mx-auto">
            Haz clic en "Re-ejecutar Prueba en Vivo" para consultar la tienda y validar la coherencia de todos los campos mapeados.
          </p>
          <button (click)="runLiveTest()" [disabled]="testingMapping()" class="btn btn-primary btn-sm">
            ⚡ Ejecutar Prueba en Vivo
          </button>
        </div>
      </div>

      <!-- MAPPING WIZARD MODAL (FULLSCREEN DEDICATED VIEW) -->
      <div *ngIf="showWizard" class="wizard-fullscreen-overlay">
        <div class="wizard-fullscreen-container">
          <!-- Wizard Header -->
          <div class="wizard-header">
            <div class="flex items-center gap-3">
              <span class="text-2xl p-2 bg-indigo-950/80 rounded-lg border border-indigo-500/30">🪄</span>
              <div>
                <h3 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                  Asistente de Mapeo Inteligente (Mapping Wizard)
                  <span class="badge badge-primary text-[10px] font-mono uppercase">{{ integration?.provider || mappingResult()?.provider || 'WOOCOMMERCE' }}</span>
                </h3>
                <p class="text-xs text-slate-400">Configuración guiada paso a paso, análisis de sugerencias y prueba con pedido en vivo</p>
              </div>
            </div>
            <button (click)="showWizard = false" class="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs">
              <span>✕</span> Salir del Asistente
            </button>
          </div>

          <!-- Wizard Stepper Indicators -->
          <div class="grid grid-cols-4 gap-3 p-4 bg-slate-900 border-b border-slate-800 text-center text-xs">
            <div class="p-3 rounded-lg border flex items-center justify-center gap-2" [ngClass]="wizardStep === 1 ? 'bg-indigo-950/90 border-indigo-500 text-indigo-300 font-bold shadow-sm' : 'bg-slate-950/80 border-slate-800 text-slate-500'">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" [ngClass]="wizardStep === 1 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'">1</span>
              <span>1. Payload Muestra</span>
            </div>
            <div class="p-3 rounded-lg border flex items-center justify-center gap-2" [ngClass]="wizardStep === 2 ? 'bg-indigo-950/90 border-indigo-500 text-indigo-300 font-bold shadow-sm' : 'bg-slate-950/80 border-slate-800 text-slate-500'">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" [ngClass]="wizardStep === 2 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'">2</span>
              <span>2. Sugerencias Detectadas</span>
            </div>
            <div class="p-3 rounded-lg border flex items-center justify-center gap-2" [ngClass]="wizardStep === 3 ? 'bg-indigo-950/90 border-indigo-500 text-indigo-300 font-bold shadow-sm' : 'bg-slate-950/80 border-slate-800 text-slate-500'">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" [ngClass]="wizardStep === 3 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'">3</span>
              <span>3. Prueba & Preview Canónico</span>
            </div>
            <div class="p-3 rounded-lg border flex items-center justify-center gap-2" [ngClass]="wizardStep === 4 ? 'bg-indigo-950/90 border-indigo-500 text-indigo-300 font-bold shadow-sm' : 'bg-slate-950/80 border-slate-800 text-slate-500'">
              <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" [ngClass]="wizardStep === 4 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'">4</span>
              <span>4. Guardar Nueva Versión</span>
            </div>
          </div>

          <!-- Wizard Body Content -->
          <div class="wizard-body space-y-5">
            <!-- STEP 1: SAMPLE PAYLOAD -->
            <div *ngIf="wizardStep === 1" class="space-y-4">
              <div class="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                <div class="font-bold text-slate-100 text-base flex items-center gap-2">
                  <span>📥</span> Paso 1: Obtener Pedido de Muestra Real
                </div>
                <p class="text-slate-400 text-xs">
                  Para poder inferir los campos automáticamente y validar las transformaciones con datos 100% reales, obtenemos un pedido de muestra de la tienda externa <strong>{{ integration?.provider || mappingResult()?.provider || 'WOOCOMMERCE' }}</strong>.
                </p>
                <div class="pt-2 flex items-center gap-4">
                  <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-primary btn-sm flex items-center gap-2 px-4 py-2 font-semibold">
                    <span>⚡</span> {{ loadingSample() ? 'Consultando API en Vivo...' : 'Consultar Pedido en Vivo del Proveedor' }}
                  </button>
                  <span *ngIf="samplePayload" class="text-emerald-400 font-bold text-xs flex items-center gap-1 bg-emerald-950/40 px-3 py-1.5 rounded border border-emerald-500/30">
                    ✅ Payload cargado correctamente ({{ flattenedSampleKeys.length }} nodos detectados)
                  </span>
                </div>
              </div>

              <div *ngIf="samplePayload" class="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden shadow-sm space-y-0">
                <div class="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <span class="text-base">📋</span>
                    <span class="text-xs font-bold text-slate-200 uppercase tracking-wider">Matriz de Claves y Valores del Payload de Origen</span>
                  </div>
                  <span class="badge badge-primary text-[11px] font-mono">
                    {{ flattenedSampleKeys.length }} nodos detectados
                  </span>
                </div>

                <div class="table-container border-0 rounded-none bg-transparent max-h-[55vh] overflow-y-auto">
                  <table class="w-full text-left">
                    <thead class="bg-slate-900/90 text-slate-300 border-b border-slate-800 text-xs sticky top-0 z-10">
                      <tr>
                        <th class="w-1/2 p-3 font-bold uppercase text-slate-400">Ruta / Clave JSON (Source Path)</th>
                        <th class="w-1/2 p-3 font-bold uppercase text-slate-400">Valor Extraído en Pedido de Muestra</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/80 font-mono text-xs">
                      <tr *ngFor="let item of flattenedSampleKeys" class="hover:bg-slate-900/50 transition">
                        <td class="p-3 align-top">
                          <span class="text-indigo-300 font-bold bg-slate-900 px-2 py-1 rounded border border-indigo-500/20 inline-block">
                            {{ item.path }}
                          </span>
                        </td>
                        <td class="p-3 align-top text-emerald-400 font-semibold break-all">
                          {{ item.value }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- STEP 2: AUTO-MAPPING SUGGESTIONS -->
            <div *ngIf="wizardStep === 2" class="space-y-4">
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div class="font-bold text-slate-100 text-sm flex items-center gap-2">
                    <span>🪄</span> Paso 2: Sugerencias Automáticas Detectadas
                  </div>
                  <p class="text-slate-400 text-xs mt-0.5">
                    Selecciona las correspondencias sugeridas que deseas aplicar como reglas activas para este proveedor.
                  </p>
                </div>
                <button (click)="suggestAutoMappings()" [disabled]="loadingAutoMap()" class="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs">
                  <span>🔄</span> {{ loadingAutoMap() ? 'Escaneando...' : 'Re-analizar Payload' }}
                </button>
              </div>

              <div *ngIf="autoSuggestions.length > 0" class="border border-slate-800 rounded-xl overflow-hidden bg-slate-950 shadow-inner">
                <div class="max-h-[60vh] overflow-y-auto">
                  <table class="w-full text-left">
                    <thead class="bg-slate-900/90 text-slate-300 border-b border-slate-800 text-xs sticky top-0 z-10">
                      <tr>
                        <th class="p-3 w-10 text-center"><input type="checkbox" (change)="toggleAllSuggestions($event)" checked class="form-checkbox rounded" /></th>
                        <th class="p-3">Campo Canónico Objetivo</th>
                        <th class="p-3">Ruta de Origen Detectada</th>
                        <th class="p-3">Transformación Sugerida</th>
                        <th class="p-3 text-center">Nivel de Confianza</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/80 font-mono text-xs">
                      <tr *ngFor="let s of autoSuggestions; let i = index" class="hover:bg-slate-900/50 transition">
                        <td class="p-3 text-center"><input type="checkbox" [(ngModel)]="selectedSuggestions[i]" class="form-checkbox rounded" /></td>
                        <td class="p-3 font-bold text-indigo-300">{{ s.canonical_field }}</td>
                        <td class="p-3 text-emerald-400 bg-slate-900/40">{{ s.source_path }}</td>
                        <td class="p-3 text-slate-200">
                          <span class="code-badge text-xs">{{ s.transformation || 'COPY' }}</span>
                        </td>
                        <td class="p-3 text-center">
                          <span class="badge badge-success text-[10px] font-bold">{{ s.confidence * 100 | number:'1.0-0' }}% MATCH</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div *ngIf="autoSuggestions.length === 0" class="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center text-slate-500 space-y-2">
                <div class="text-3xl">🪄</div>
                <div class="text-sm font-semibold text-slate-400">Sin sugerencias generadas</div>
                <p class="text-xs">Haz clic en "Re-analizar Payload" para escanear las claves JSON de la tienda.</p>
              </div>
            </div>

            <!-- STEP 3: DRY-RUN PREVIEW BEFORE SAVING -->
            <div *ngIf="wizardStep === 3" class="space-y-4">
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div class="font-bold text-slate-100 text-sm flex items-center gap-2">
                    <span>🔬</span> Paso 3: Probar Pedido Canónico Antes de Confirmar
                  </div>
                  <p class="text-slate-400 text-xs mt-0.5">
                    Ejecuta una transformación de prueba para asegurar que el modelo canónico se construya íntegramente.
                  </p>
                </div>
                <button (click)="runWizardDryRun()" [disabled]="testingMapping()" class="btn btn-primary btn-sm flex items-center gap-2 text-xs">
                  <span>⚡</span> {{ testingMapping() ? 'Probando...' : 'Re-ejecutar Prueba' }}
                </button>
              </div>

              <div *ngIf="wizardPreview" class="space-y-4">
                <div *ngIf="wizardPreview.warnings && wizardPreview.warnings.length > 0" class="bg-amber-950/40 border border-amber-800/60 rounded-xl p-4 space-y-1.5">
                  <div class="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                    <span>⚠️</span> Observaciones de Mapeo ({{ wizardPreview.warnings.length }}):
                  </div>
                  <div *ngFor="let w of wizardPreview.warnings" class="text-[11px] text-amber-300/80 font-mono">
                    • [{{ w.warning_type }}] {{ w.canonical_field }}: {{ w.message }}
                  </div>
                </div>

                <div *ngIf="wizardPreview.canonical_order" class="bg-slate-950 border border-slate-800 rounded-xl p-5 font-mono text-xs space-y-4 shadow-sm">
                  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-800 pb-3">
                    <div>
                      <span class="text-slate-500 text-[10px] uppercase block">Número de Pedido:</span>
                      <div class="font-bold text-emerald-400 text-base">#{{ wizardPreview.canonical_order.order_number }}</div>
                    </div>
                    <div>
                      <span class="text-slate-500 text-[10px] uppercase block">Total Facturado:</span>
                      <div class="font-bold text-amber-400 text-base">\${{ wizardPreview.canonical_order.total | number }} {{ wizardPreview.canonical_order.currency }}</div>
                    </div>
                    <div>
                      <span class="text-slate-500 text-[10px] uppercase block">Estado Canónico:</span>
                      <div class="font-bold text-indigo-400 text-base">{{ wizardPreview.canonical_order.status }}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-800 pb-3">
                    <div class="p-3 bg-slate-900/60 rounded-lg border border-slate-800/80">
                      <span class="text-slate-500 text-[10px] uppercase block font-bold mb-1">👤 Cliente:</span>
                      <div class="text-slate-100 font-bold">{{ wizardPreview.canonical_order.customer.name }}</div>
                      <div class="text-indigo-300 text-[11px]">{{ wizardPreview.canonical_order.customer.email }}</div>
                    </div>
                    <div class="p-3 bg-slate-900/60 rounded-lg border border-slate-800/80">
                      <span class="text-slate-500 text-[10px] uppercase block font-bold mb-1">📍 Dirección Canónica:</span>
                      <div class="text-emerald-300 font-bold">{{ wizardPreview.canonical_order.delivery.address }}</div>
                      <div class="text-amber-400">{{ wizardPreview.canonical_order.delivery.city }}, {{ wizardPreview.canonical_order.delivery.region }}</div>
                    </div>
                  </div>

                  <div *ngIf="wizardPreview.canonical_order.items && wizardPreview.canonical_order.items.length > 0">
                    <span class="text-slate-500 text-[10px] uppercase block font-bold mb-2">🛒 Productos Extraídos ({{ wizardPreview.canonical_order.items.length }}):</span>
                    <div class="space-y-1.5">
                      <div *ngFor="let itm of wizardPreview.canonical_order.items" class="p-2 bg-slate-900 rounded border border-slate-800/80 flex items-center justify-between text-[11px]">
                        <span><strong class="text-purple-300 font-mono">{{ itm.sku }}</strong> - {{ itm.description }} (x{{ itm.quantity }})</span>
                        <span class="font-bold text-amber-400">\${{ itm.total | number }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- STEP 4: COMMIT & VERSION SNAPSHOT -->
            <div *ngIf="wizardStep === 4" class="space-y-4">
              <div class="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-4">
                <div class="font-bold text-slate-100 text-base flex items-center gap-2">
                  <span>💾</span> Paso 4: Confirmar y Guardar Nueva Versión
                </div>
                <p class="text-slate-400 text-xs">
                  Se generará una nueva versión histórica (v{{ (mappingResult()?.current_version || 1) + 1 }}) con snapshot inmutable para auditoría y rollback seguro.
                </p>

                <div>
                  <label class="block text-slate-300 mb-1.5 font-bold">Descripción del Cambio / Motivo de la Versión:</label>
                  <input type="text" [(ngModel)]="wizardCommitDescription" placeholder="ej. Mapeo inicial de tienda, ajuste de dirección para plugin custom" class="form-control text-xs py-2.5 px-3 bg-slate-900 border-slate-800 w-full rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          <!-- Wizard Footer Navigation Buttons -->
          <div class="wizard-footer">
            <button *ngIf="wizardStep > 1" (click)="wizardStep = wizardStep - 1" class="btn btn-secondary btn-sm flex items-center gap-1">
              <span>⬅️</span> Anterior
            </button>
            <div *ngIf="wizardStep === 1"></div>

            <div class="flex items-center gap-3">
              <button (click)="showWizard = false" class="btn btn-secondary btn-sm">Cancelar</button>
              <button *ngIf="wizardStep < 4" (click)="advanceWizardStep()" class="btn btn-primary btn-sm flex items-center gap-1 font-semibold px-4 py-2">
                <span>Siguiente</span> <span>➡️</span>
              </button>
              <button *ngIf="wizardStep === 4" (click)="commitWizard()" class="btn btn-primary btn-sm flex items-center gap-2 shadow-sm font-semibold px-5 py-2">
                <span>💾</span> Confirmar y Guardar Versión
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- EDIT RULE / ADD MAPPING MODAL -->
      <div *ngIf="showRuleModal" class="modal-overlay">
        <div class="modal-container max-w-lg">
          <div class="modal-header">
            <h3 class="text-base font-bold text-slate-100">
              {{ editingRule.id ? '✏️ Editar Regla de Mapeo' : '➕ Nueva Regla de Mapeo' }}
            </h3>
            <button (click)="showRuleModal = false" class="text-slate-400 hover:text-slate-200 text-lg">✕</button>
          </div>

          <div class="modal-body space-y-3.5 text-xs">
            <div>
              <label class="block text-slate-400 mb-1">Campo Canónico Objetivo:</label>
              <select [(ngModel)]="editingRule.canonical_field" class="form-select text-xs py-1.5 px-3 bg-slate-950 border-slate-800 w-full">
                <option *ngFor="let cf of canonicalFields()" [value]="cf.id">
                  {{ cf.id }} - {{ cf.name }} ({{ cf.group_name }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-slate-400 mb-1">Ruta de Origen (Source Path):</label>
              <input type="text" [(ngModel)]="editingRule.source_path" placeholder="ej. meta_data.custom_delivery_address o line_items[].sku" class="form-control text-xs py-1.5 px-3 bg-slate-950 border-slate-800 font-mono w-full" />
              <div class="text-[10px] text-slate-500 mt-1">Soporta rutas anidadas con puntos y arreglos (items[].* -> line_items[].*)</div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-slate-400 mb-1">Transformación:</label>
                <select [(ngModel)]="editingRule.transformation" class="form-select text-xs py-1.5 px-3 bg-slate-950 border-slate-800 w-full">
                  <option value="COPY">COPY (Directo)</option>
                  <option value="STATUS_MAP">STATUS_MAP (Diccionario)</option>
                  <option value="DATE_FORMAT">DATE_FORMAT (ISO8601)</option>
                  <option value="NUMBER">NUMBER (Decimal)</option>
                  <option value="CONCAT">CONCAT (Combinar)</option>
                  <option value="UPPERCASE">UPPERCASE</option>
                  <option value="LOWERCASE">LOWERCASE</option>
                  <option value="TRIM">TRIM</option>
                  <option value="DEFAULT">DEFAULT</option>
                </select>
              </div>

              <div>
                <label class="block text-slate-400 mb-1">Valor por Defecto (Fallback):</label>
                <input type="text" [(ngModel)]="editingRule.default_value" placeholder="ej. CL o 0" class="form-control text-xs py-1.5 px-3 bg-slate-950 border-slate-800 w-full" />
              </div>
            </div>

            <div class="flex items-center gap-4 pt-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" [(ngModel)]="editingRule.required" class="form-checkbox text-indigo-500 rounded bg-slate-950 border-slate-800" />
                <span class="text-slate-300">Marcar como Requerido</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" [(ngModel)]="editingRule.enabled" class="form-checkbox text-indigo-500 rounded bg-slate-950 border-slate-800" />
                <span class="text-slate-300">Habilitado</span>
              </label>
            </div>
          </div>

          <div class="modal-footer">
            <button (click)="showRuleModal = false" class="btn btn-secondary btn-sm">Cancelar</button>
            <button (click)="saveSingleRule()" class="btn btn-primary btn-sm">Guardar Regla</button>
          </div>
        </div>
      </div>

      <!-- VERSION HISTORY MODAL -->
      <div *ngIf="showVersionModal" class="modal-overlay">
        <div class="modal-container max-w-xl">
          <div class="modal-header">
            <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>🕒</span> Historial de Versiones y Rollback
            </h3>
            <button (click)="showVersionModal = false" class="text-slate-400 hover:text-slate-200 text-lg">✕</button>
          </div>

          <div class="modal-body space-y-2">
            <div *ngFor="let v of versions()" class="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
              <div>
                <div class="font-bold text-slate-200 flex items-center gap-2">
                  <span>Versión {{ v.version }}</span>
                  <span *ngIf="v.version === mappingResult()?.current_version" class="badge badge-primary text-[9px]">ACTUAL</span>
                </div>
                <div class="text-slate-400 text-[11px]">{{ v.description }}</div>
                <div class="text-[10px] text-slate-500">{{ v.created_at | date:'dd/MM/yyyy HH:mm' }} por {{ v.created_by }}</div>
              </div>

              <button *ngIf="v.version !== mappingResult()?.current_version" (click)="restoreVersion(v.version)" class="btn btn-secondary btn-sm text-xs">
                ⏪ Restaurar
              </button>
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
    .wizard-fullscreen-overlay {
      position: fixed !important;
      inset: 0 !important;
      background: #090d16 !important;
      z-index: 99999 !important;
      display: flex !important;
      flex-direction: column !important;
      width: 100vw !important;
      height: 100vh !important;
      overflow: hidden !important;
    }
    .wizard-fullscreen-container {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      background: #0b1120 !important;
      color: #f8fafc !important;
    }
    .wizard-header {
      padding: 1.25rem 2rem !important;
      border-bottom: 1px solid #1e293b !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      background: #0f172a !important;
      flex-shrink: 0 !important;
    }
    .wizard-body {
      padding: 2rem !important;
      overflow-y: auto !important;
      flex: 1 !important;
      background: #0b1120 !important;
    }
    .wizard-footer {
      padding: 1.25rem 2rem !important;
      border-top: 1px solid #1e293b !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      background: #0f172a !important;
      flex-shrink: 0 !important;
    }
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
      padding: 1rem 2rem !important;
      border-top: 1px solid #1e293b !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      background: #0f172a !important;
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

  activeTab: 'mappings' | 'explorer' | 'preview' = 'mappings';

  mappingResult = signal<EffectiveMappingResult | null>(null);
  canonicalFields = signal<CanonicalField[]>([]);
  versions = signal<MappingVersion[]>([]);

  activeMappings = signal<FieldMapping[]>([]);
  filterSearch = '';
  filterGroup = '';

  samplePayload: any = null;
  flattenedSampleKeys: Array<{ path: string; value: string }> = [];
  loadingSample = signal<boolean>(false);
  testingMapping = signal<boolean>(false);
  loadingAutoMap = signal<boolean>(false);

  previewResult: MappingPreviewResponse | null = null;

  // Modals
  showWizard = false;
  showRuleModal = false;
  showVersionModal = false;

  autoSuggestions: AutoMappingSuggestion[] = [];

  quickAssignPath = '';
  quickAssignCanonical = 'delivery.address';
  quickAssignTransform = 'COPY';

  editingRule: Partial<FieldMapping> = {
    canonical_field: 'delivery.address',
    source_path: '',
    transformation: 'COPY',
    data_type: 'STRING',
    required: false,
    enabled: true
  };

  get integrationId(): string {
    return this.integration?.id || this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit() {
    const routeId = this.route.snapshot.paramMap.get('id');
    if (!this.integration && routeId) {
      this.api.getIntegration(routeId).subscribe({
        next: (it) => {
          this.integration = it;
          this.loadData();
        },
        error: () => {
          this.integration = {
            id: routeId,
            customer_id: '',
            customer_name: '',
            name: `Integración ${routeId}`,
            provider: 'WOOCOMMERCE',
            base_url: '',
            auth_type: 'API_KEY',
            status: 'ACTIVE',
            polling_interval_minutes: 5,
            polling_enabled: true,
            total_orders_synced: 0,
            consecutive_errors: 0,
            avg_response_time_ms: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          this.loadData();
        }
      });
    } else if (this.integration) {
      this.loadData();
    }
  }

  loadData() {
    if (!this.integration?.id) return;
    this.loadEffectiveMapping();
    this.loadCanonicalFields();
    this.loadVersions();
  }

  loadEffectiveMapping() {
    if (!this.integration?.id) return;
    this.api.getIntegrationMapping(this.integrationId).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings || []);
        if (res.latest_sample) {
          this.samplePayload = res.latest_sample;
          this.flattenSample(res.latest_sample);
        }
      },
      error: () => this.toast.error('Error cargando mappings de la integración')
    });
  }

  loadCanonicalFields() {
    this.api.getCanonicalFields().subscribe({
      next: (fields) => this.canonicalFields.set(fields),
      error: () => this.toast.error('Error cargando catálogo de campos canónicos')
    });
  }

  loadVersions() {
    if (!this.integration?.id) return;
    this.api.getMappingVersions(this.integrationId).subscribe({
      next: (v) => this.versions.set(v),
      error: () => {}
    });
  }

  filteredMappings(): FieldMapping[] {
    let list = this.activeMappings();
    if (this.filterGroup) {
      list = list.filter(m => m.canonical_field.startsWith(this.filterGroup));
    }
    if (this.filterSearch) {
      const q = this.filterSearch.toLowerCase();
      list = list.filter(m => m.canonical_field.toLowerCase().includes(q) || m.source_path.toLowerCase().includes(q));
    }
    return list;
  }

  overrideCount(): number {
    return this.activeMappings().filter(m => m.mapping_type === 'OVERRIDE').length;
  }

  getGroupIcon(field: string): string {
    if (field.startsWith('order.')) return '📦';
    if (field.startsWith('customer.')) return '👤';
    if (field.startsWith('delivery.')) return '📍';
    if (field.startsWith('items')) return '🛒';
    return '🔹';
  }

  getCanonicalFieldTitle(fieldId: string): string {
    const cf = this.canonicalFields().find(f => f.id === fieldId);
    return cf ? cf.name : '';
  }

  getCoherenceRows(): Array<{
    fieldId: string;
    fieldName: string;
    icon: string;
    sourcePath: string;
    transformation: string;
    isOverride: boolean;
    required: boolean;
    hasValue: boolean;
    value: string;
    detail: string;
    isCoherent: boolean;
  }> {
    const order = this.previewResult?.canonical_order;
    const mappings = this.activeMappings();

    const fieldsToInspect = [
      { id: 'order.order_number', name: 'Número de Pedido', icon: '📦', req: true },
      { id: 'order.id', name: 'ID Externo Tienda', icon: '🔑', req: true },
      { id: 'order.status', name: 'Estado Normalizado', icon: '🔄', req: true },
      { id: 'order.created_at', name: 'Fecha de Emisión', icon: '📅', req: true },
      { id: 'order.total', name: 'Monto Total Facturado', icon: '💰', req: true },
      { id: 'order.currency', name: 'Moneda', icon: '💵', req: false },
      { id: 'customer.name', name: 'Nombre Completo del Cliente', icon: '👤', req: true },
      { id: 'customer.email', name: 'Email del Cliente', icon: '✉️', req: true },
      { id: 'customer.phone', name: 'Teléfono del Cliente', icon: '📞', req: false },
      { id: 'delivery.address', name: 'Dirección de Despacho', icon: '📍', req: true },
      { id: 'delivery.city', name: 'Comuna / Ciudad de Entrega', icon: '🏘️', req: true },
      { id: 'delivery.commune', name: 'Comuna Específica', icon: '🏘️', req: false },
      { id: 'delivery.region', name: 'Región / Estado', icon: '🗺️', req: false },
      { id: 'delivery.country', name: 'País de Despacho', icon: '🇨🇱', req: false },
      { id: 'items[].sku', name: 'SKU de Artículos', icon: '🏷️', req: true },
      { id: 'items[].description', name: 'Descripción de Productos', icon: '📝', req: true },
      { id: 'items[].quantity', name: 'Cantidad Comprada', icon: '🔢', req: true },
      { id: 'items[].unit_price', name: 'Precio Unitario', icon: '💲', req: true },
      { id: 'items[].total', name: 'Total Línea de Ítem', icon: '📊', req: false }
    ];

    return fieldsToInspect.map(f => {
      const mapping = mappings.find(m => m.canonical_field === f.id);
      let value = '';
      let detail = '';
      let hasValue = false;
      let isCoherent = false;

      if (order) {
        switch (f.id) {
          case 'order.order_number':
            value = order.order_number ? `#${order.order_number}` : '';
            break;
          case 'order.id':
            value = order.external_id || order.id || '';
            break;
          case 'order.status':
            value = order.status || '';
            break;
          case 'order.created_at':
            value = order.created_at ? new Date(order.created_at).toLocaleString() : '';
            break;
          case 'order.total':
            value = order.total !== undefined ? `$${order.total.toLocaleString()} ${order.currency || 'CLP'}` : '';
            break;
          case 'order.currency':
            value = order.currency || '';
            break;
          case 'customer.name':
            value = order.customer?.name || '';
            break;
          case 'customer.email':
            value = order.customer?.email || '';
            break;
          case 'customer.phone':
            value = order.customer?.phone || '';
            break;
          case 'delivery.address':
            value = order.delivery?.address || '';
            break;
          case 'delivery.city':
            value = order.delivery?.city || '';
            break;
          case 'delivery.commune':
            value = order.delivery?.city || order.delivery?.address || '';
            break;
          case 'delivery.region':
            value = order.delivery?.region || '';
            break;
          case 'delivery.country':
            value = order.delivery?.country || 'CL';
            break;
          case 'items[].sku':
            if (order.items && order.items.length > 0) {
              value = order.items.map(it => it.sku).join(', ');
              detail = `${order.items.length} SKU(s) extraídos`;
            }
            break;
          case 'items[].description':
            if (order.items && order.items.length > 0) {
              value = order.items.map(it => it.description).join(', ');
            }
            break;
          case 'items[].quantity':
            if (order.items && order.items.length > 0) {
              value = order.items.map(it => `${it.quantity} un.`).join(', ');
            }
            break;
          case 'items[].unit_price':
            if (order.items && order.items.length > 0) {
              value = order.items.map(it => `$${it.unit_price}`).join(', ');
            }
            break;
          case 'items[].total':
            if (order.items && order.items.length > 0) {
              value = order.items.map(it => `$${it.total}`).join(', ');
            }
            break;
        }
      }

      hasValue = !!value && value.trim() !== '' && value !== '$undefined undefined';
      isCoherent = hasValue && (!mapping || mapping.enabled !== false);

      return {
        fieldId: f.id,
        fieldName: f.name,
        icon: f.icon,
        sourcePath: mapping?.source_path || (mapping?.default_value ? `(Default: "${mapping.default_value}")` : ''),
        transformation: mapping?.transformation || 'COPY',
        isOverride: mapping?.mapping_type === 'OVERRIDE',
        required: f.req,
        hasValue,
        value: hasValue ? value : '',
        detail,
        isCoherent
      };
    });
  }

  fetchSampleOrder() {
    this.loadingSample.set(true);
    this.api.fetchSampleOrderPayload(this.integrationId).subscribe({
      next: (res) => {
        this.loadingSample.set(false);
        this.samplePayload = res.raw_payload;
        this.flattenSample(res.raw_payload);
        this.toast.success('Sample payload recuperado de la API externa');
      },
      error: (err) => {
        this.loadingSample.set(false);
        this.toast.error('Error al recuperar sample: ' + (err.error?.error || err.message));
      }
    });
  }

  flattenSample(obj: any) {
    const list: Array<{ path: string; value: string }> = [];
    const recurse = (prefix: string, o: any) => {
      if (!o) return;
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
  }

  selectPathFromTree(path: string) {
    this.quickAssignPath = path;
  }

  applyQuickAssign() {
    if (!this.quickAssignPath || !this.quickAssignCanonical) return;
    const mappings = [...this.activeMappings()];
    const idx = mappings.findIndex(m => m.canonical_field === this.quickAssignCanonical);
    const newRule: FieldMapping = {
      canonical_field: this.quickAssignCanonical,
      source_path: this.quickAssignPath,
      transformation: this.quickAssignTransform,
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
        this.toast.success(`Campo ${this.quickAssignCanonical} reasignado a ${this.quickAssignPath}`);
        this.loadVersions();
      },
      error: (err) => this.toast.error('Error guardando mapeo: ' + (err.error?.error || err.message))
    });
  }

  runLiveTest() {
    this.testingMapping.set(true);
    this.api.testIntegrationMapping(this.integrationId, this.activeMappings()).subscribe({
      next: (res) => {
        this.testingMapping.set(false);
        this.previewResult = res;
        this.activeTab = 'preview';
        if (res.success) {
          this.toast.success('Test ejecutado exitosamente. Orden canónica válida.');
        } else {
          this.toast.error('Test falló con observaciones.');
        }
      },
      error: (err) => {
        this.testingMapping.set(false);
        this.toast.error('Error en prueba: ' + (err.error?.error || err.message));
      }
    });
  }

  wizardStep = 1;
  selectedSuggestions: boolean[] = [];
  wizardCommitDescription = 'Ajuste de mapeo mediante asistente guiado';
  wizardPreview: MappingPreviewResponse | null = null;

  openWizard() {
    this.wizardStep = 1;
    this.showWizard = true;
    if (!this.samplePayload) {
      this.fetchSampleOrder();
    }
  }

  advanceWizardStep() {
    if (this.wizardStep === 1) {
      this.suggestAutoMappings();
      this.wizardStep = 2;
    } else if (this.wizardStep === 2) {
      this.runWizardDryRun();
      this.wizardStep = 3;
    } else if (this.wizardStep === 3) {
      this.wizardStep = 4;
    }
  }

  toggleAllSuggestions(event: any) {
    const checked = event.target.checked;
    this.selectedSuggestions = this.autoSuggestions.map(() => checked);
  }

  suggestAutoMappings() {
    this.loadingAutoMap.set(true);
    this.api.suggestAutoMappings(this.integrationId).subscribe({
      next: (s) => {
        this.loadingAutoMap.set(false);
        this.autoSuggestions = s;
        this.selectedSuggestions = s.map(() => true);
        this.toast.success(`Se detectaron ${s.length} sugerencias automáticas`);
      },
      error: (err) => {
        this.loadingAutoMap.set(false);
        this.toast.error('Error al generar sugerencias: ' + (err.error?.error || err.message));
      }
    });
  }

  runWizardDryRun() {
    this.testingMapping.set(true);
    const candidateMappings = this.buildCandidateMappings();

    if (this.samplePayload) {
      this.api.previewMapping({ raw_payload: this.samplePayload, mappings: candidateMappings }).subscribe({
        next: (res) => {
          this.testingMapping.set(false);
          this.wizardPreview = res;
        },
        error: () => this.testingMapping.set(false)
      });
    } else {
      this.api.testIntegrationMapping(this.integrationId, candidateMappings).subscribe({
        next: (res) => {
          this.testingMapping.set(false);
          this.wizardPreview = res;
        },
        error: () => this.testingMapping.set(false)
      });
    }
  }

  buildCandidateMappings(): FieldMapping[] {
    const mappings = [...this.activeMappings()];
    this.autoSuggestions.forEach((s, idx) => {
      if (this.selectedSuggestions[idx]) {
        const found = mappings.findIndex(m => m.canonical_field === s.canonical_field);
        const rule: FieldMapping = {
          canonical_field: s.canonical_field,
          source_path: s.source_path,
          transformation: s.transformation || 'COPY',
          mapping_type: 'OVERRIDE',
          data_type: 'STRING',
          required: true,
          default_value: '',
          enabled: true
        };
        if (found >= 0) {
          mappings[found] = rule;
        } else {
          mappings.push(rule);
        }
      }
    });
    return mappings;
  }

  commitWizard() {
    const finalMappings = this.buildCandidateMappings();
    this.api.saveIntegrationMapping(this.integrationId, finalMappings).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.showWizard = false;
        this.toast.success(`Versión v${res.current_version} guardada exitosamente`);
        this.loadVersions();
        this.activeTab = 'mappings';
      },
      error: (err) => this.toast.error('Error al guardar versión: ' + (err.error?.error || err.message))
    });
  }

  openAddMappingModal() {
    this.editingRule = {
      canonical_field: 'delivery.address',
      source_path: '',
      transformation: 'COPY',
      data_type: 'STRING',
      required: false,
      enabled: true
    };
    this.showRuleModal = true;
  }

  openEditRuleModal(rule: FieldMapping) {
    this.editingRule = { ...rule };
    this.showRuleModal = true;
  }

  saveSingleRule() {
    if (!this.editingRule.canonical_field) return;
    const mappings = [...this.activeMappings()];
    const idx = mappings.findIndex(m => m.canonical_field === this.editingRule.canonical_field);
    const ruleToSave: FieldMapping = {
      id: this.editingRule.id,
      canonical_field: this.editingRule.canonical_field,
      source_path: this.editingRule.source_path || '',
      transformation: this.editingRule.transformation || 'COPY',
      mapping_type: 'OVERRIDE',
      data_type: this.editingRule.data_type || 'STRING',
      required: !!this.editingRule.required,
      default_value: this.editingRule.default_value || '',
      enabled: this.editingRule.enabled !== false
    };

    if (idx >= 0) {
      mappings[idx] = ruleToSave;
    } else {
      mappings.push(ruleToSave);
    }

    this.api.saveIntegrationMapping(this.integrationId, mappings).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.showRuleModal = false;
        this.toast.success('Regla de mapeo guardada');
        this.loadVersions();
      },
      error: (err) => this.toast.error('Error guardando regla: ' + (err.error?.error || err.message))
    });
  }

  deleteOverride(rule: FieldMapping) {
    if (!rule.id) return;
    if (!confirm(`¿Restaurar '${rule.canonical_field}' a su valor por defecto del proveedor?`)) return;

    this.api.deleteIntegrationMappingRule(this.integrationId, rule.id).subscribe({
      next: () => {
        this.toast.success(`Campo ${rule.canonical_field} restaurado a default`);
        this.loadEffectiveMapping();
        this.loadVersions();
      },
      error: () => this.toast.error('Error eliminando override')
    });
  }

  openVersionHistory() {
    this.loadVersions();
    this.showVersionModal = true;
  }

  restoreVersion(version: number) {
    if (!confirm(`¿Estás seguro de restaurar a la Versión ${version}? Se sobrescribirán las reglas actuales.`)) return;

    this.api.restoreMappingVersion(this.integrationId, version).subscribe({
      next: (res) => {
        this.mappingResult.set(res);
        this.activeMappings.set(res.mappings);
        this.showVersionModal = false;
        this.toast.success(`Restaurado exitosamente a la versión ${version}`);
        this.loadVersions();
      },
      error: (err) => this.toast.error('Error restaurando versión: ' + (err.error?.error || err.message))
    });
  }
}
