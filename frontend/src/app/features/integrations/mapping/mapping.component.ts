import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mapping-container space-y-6">
      <!-- Header Bar with Stats & Actions -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <div class="flex items-center gap-3">
            <span class="text-2xl">🗺️</span>
            <div>
              <h3 class="text-lg font-bold text-slate-100 flex items-center gap-2">
                Mapeo Dinámico de Campos: {{ mappingResult()?.integration_name || integration.name }}
                <span class="badge badge-primary text-[10px] uppercase font-mono">v{{ mappingResult()?.current_version || 1 }}</span>
              </h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Transformación del payload de origen ({{ integration.provider }}) al modelo canónico de la plataforma
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
          <button (click)="close.emit()" class="btn btn-secondary btn-sm">
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
            {{ integration.provider }} GENÉRICO
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
      <div *ngIf="activeTab === 'preview'" class="space-y-4">
        <div class="card bg-slate-900 border-slate-800 p-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h4 class="text-sm font-bold text-slate-200">🔬 Prueba en Vivo (Mapping Preview)</h4>
              <p class="text-xs text-slate-400">Verificación del objeto CanonicalOrder generado a partir del Sample Payload</p>
            </div>
            <button (click)="runLiveTest()" [disabled]="testingMapping()" class="btn btn-primary btn-sm text-xs">
              {{ testingMapping() ? 'Ejecutando...' : '⚡ Re-ejecutar Test' }}
            </button>
          </div>

          <div *ngIf="previewResult" class="space-y-4">
            <!-- Warnings / Diagnostics Banner -->
            <div *ngIf="previewResult.warnings && previewResult.warnings.length > 0" class="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 space-y-1">
              <div class="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                <span>⚠️</span> Diagnóstico de Mapeo ({{ previewResult.warnings.length }} observaciones):
              </div>
              <div *ngFor="let w of previewResult.warnings" class="text-[11px] text-amber-300/80 font-mono">
                • [{{ w.warning_type }}] {{ w.canonical_field }}: {{ w.message }}
              </div>
            </div>

            <!-- Canonical Order Object Display -->
            <div *ngIf="previewResult.canonical_order" class="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-200 space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-slate-800 pb-3">
                <div>
                  <span class="text-slate-500">ID / Número:</span>
                  <div class="font-bold text-emerald-400">#{{ previewResult.canonical_order.order_number }} (Ext: {{ previewResult.canonical_order.external_id }})</div>
                </div>
                <div>
                  <span class="text-slate-500">Estado Canónico:</span>
                  <div class="font-bold text-indigo-400">{{ previewResult.canonical_order.status }}</div>
                </div>
                <div>
                  <span class="text-slate-500">Total Facturado:</span>
                  <div class="font-bold text-amber-400"><span>$</span>{{ previewResult.canonical_order.total | number }} {{ previewResult.canonical_order.currency }}</div>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div class="text-[11px] font-bold text-slate-400 uppercase">👤 Cliente</div>
                  <div class="text-slate-200">{{ previewResult.canonical_order.customer.name }}</div>
                  <div class="text-slate-400">{{ previewResult.canonical_order.customer.email }} | {{ previewResult.canonical_order.customer.phone }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-bold text-slate-400 uppercase">📍 Despacho & Entrega</div>
                  <div class="text-slate-200 font-bold text-emerald-300">{{ previewResult.canonical_order.delivery.address }}</div>
                  <div class="text-slate-400">{{ previewResult.canonical_order.delivery.city }}, {{ previewResult.canonical_order.delivery.region }} ({{ previewResult.canonical_order.delivery.country }})</div>
                </div>
              </div>

              <div>
                <div class="text-[11px] font-bold text-slate-400 uppercase mb-1">🛒 Productos Canónicos ({{ previewResult.canonical_order.items.length }})</div>
                <div *ngFor="let item of previewResult.canonical_order.items" class="py-1 border-b border-slate-900 flex items-center justify-between text-[11px]">
                  <span>{{ item.quantity }}x <strong class="text-slate-200">{{ item.description }}</strong> (SKU: {{ item.sku }})</span>
                  <span class="font-bold text-slate-300"><span>$</span>{{ item.total | number }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- MAPPING WIZARD MODAL (4-STEP GUIDED FLOW) -->
      <div *ngIf="showWizard" class="modal-backdrop">
        <div class="modal max-w-3xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
          <!-- Wizard Header -->
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
            <div>
              <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>🪄</span> Asistente de Mapeo (Mapping Wizard)
              </h3>
              <p class="text-xs text-slate-400">Configura, prueba con un pedido real y guarda con control de versiones</p>
            </div>
            <button (click)="showWizard = false" class="text-slate-400 hover:text-slate-200">✕</button>
          </div>

          <!-- Wizard Stepper Indicators -->
          <div class="grid grid-cols-4 gap-2 flex-shrink-0 text-center text-xs">
            <div class="p-2 rounded border" [ngClass]="wizardStep === 1 ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-500'">
              1. Payload Muestra
            </div>
            <div class="p-2 rounded border" [ngClass]="wizardStep === 2 ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-500'">
              2. Sugerencias
            </div>
            <div class="p-2 rounded border" [ngClass]="wizardStep === 3 ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-500'">
              3. Prueba & Preview
            </div>
            <div class="p-2 rounded border" [ngClass]="wizardStep === 4 ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300 font-bold' : 'bg-slate-950 border-slate-800 text-slate-500'">
              4. Guardar Versión
            </div>
          </div>

          <!-- Wizard Body Content -->
          <div class="space-y-4 text-xs overflow-y-auto flex-grow pr-1">
            <!-- STEP 1: SAMPLE PAYLOAD -->
            <div *ngIf="wizardStep === 1" class="space-y-3">
              <div class="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                <div class="font-bold text-slate-200 text-sm">Paso 1: Obtener Pedido de Muestra</div>
                <p class="text-slate-400">
                  Para poder inferir los campos y probar las transformaciones con datos reales, necesitamos un payload de muestra de <strong>{{ integration.provider }}</strong>.
                </p>
                <div class="pt-2 flex items-center gap-3">
                  <button (click)="fetchSampleOrder()" [disabled]="loadingSample()" class="btn btn-primary btn-sm text-xs flex items-center gap-1.5">
                    <span>📥</span> {{ loadingSample() ? 'Consultando API...' : 'Obtener Pedido en Vivo del Proveedor' }}
                  </button>
                  <span *ngIf="samplePayload" class="text-emerald-400 font-bold text-xs flex items-center gap-1">
                    ✅ Payload cargado correctamente
                  </span>
                </div>
              </div>

              <div *ngIf="samplePayload" class="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div class="text-[11px] font-bold text-slate-400 uppercase mb-1">Vista Previa de Claves del Payload:</div>
                <div class="font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto bg-slate-900 p-2 rounded">
                  <div *ngFor="let item of flattenedSampleKeys.slice(0, 15)">
                    <span class="text-indigo-400">{{ item.path }}:</span> <span class="text-slate-400">{{ item.value }}</span>
                  </div>
                  <div *ngIf="flattenedSampleKeys.length > 15" class="text-slate-500 italic mt-1">
                    ... y {{ flattenedSampleKeys.length - 15 }} campos más
                  </div>
                </div>
              </div>
            </div>

            <!-- STEP 2: AUTO-MAPPING SUGGESTIONS -->
            <div *ngIf="wizardStep === 2" class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-200 text-sm">Paso 2: Sugerencias Automáticas Detectadas</div>
                  <p class="text-slate-400 text-[11px]">Revisa y selecciona las correspondencias sugeridas para tus campos canónicos</p>
                </div>
                <button (click)="suggestAutoMappings()" [disabled]="loadingAutoMap()" class="btn btn-secondary btn-sm text-xs">
                  🔄 Re-analizar
                </button>
              </div>

              <div *ngIf="autoSuggestions.length > 0" class="border border-slate-800 rounded-lg overflow-hidden">
                <div class="max-h-64 overflow-y-auto">
                  <table class="w-full text-left">
                    <thead class="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                      <tr>
                        <th class="p-2 w-8"><input type="checkbox" (change)="toggleAllSuggestions($event)" checked /></th>
                        <th class="p-2">Campo Canónico</th>
                        <th class="p-2">Ruta Origen</th>
                        <th class="p-2">Transformación</th>
                        <th class="p-2">Confianza</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800/60 font-mono text-[11px]">
                      <tr *ngFor="let s of autoSuggestions; let i = index" class="hover:bg-slate-950/40">
                        <td class="p-2"><input type="checkbox" [(ngModel)]="selectedSuggestions[i]" /></td>
                        <td class="p-2 font-bold text-indigo-400">{{ s.canonical_field }}</td>
                        <td class="p-2 text-emerald-400">{{ s.source_path }}</td>
                        <td class="p-2 text-slate-300">{{ s.transformation || 'COPY' }}</td>
                        <td class="p-2">
                          <span class="badge badge-success text-[9px]">{{ s.confidence * 100 | number:'1.0-0' }}%</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div *ngIf="autoSuggestions.length === 0" class="text-center py-8 text-slate-500">
                Haz clic en "Re-analizar" para escanear el payload de muestra
              </div>
            </div>

            <!-- STEP 3: DRY-RUN PREVIEW BEFORE SAVING -->
            <div *ngIf="wizardStep === 3" class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold text-slate-200 text-sm">Paso 3: Probar Pedido Canónico Antes de Guardar</div>
                  <p class="text-slate-400 text-[11px]">Ejecuta una transformación de prueba para asegurar que los datos son correctos</p>
                </div>
                <button (click)="runWizardDryRun()" [disabled]="testingMapping()" class="btn btn-primary btn-sm text-xs">
                  ⚡ {{ testingMapping() ? 'Probando...' : 'Re-probar Mapeo' }}
                </button>
              </div>

              <div *ngIf="wizardPreview" class="space-y-3">
                <div *ngIf="wizardPreview.warnings && wizardPreview.warnings.length > 0" class="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 space-y-1">
                  <div class="font-bold text-amber-400 text-xs">⚠️ Observaciones de Mapeo ({{ wizardPreview.warnings.length }}):</div>
                  <div *ngFor="let w of wizardPreview.warnings" class="text-[11px] text-amber-300/80 font-mono">
                    • [{{ w.warning_type }}] {{ w.canonical_field }}: {{ w.message }}
                  </div>
                </div>

                <div *ngIf="wizardPreview.canonical_order" class="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs space-y-3">
                  <div class="grid grid-cols-3 gap-2 border-b border-slate-800 pb-2">
                    <div>
                      <span class="text-slate-500">ID / Número:</span>
                      <div class="font-bold text-emerald-400">#{{ wizardPreview.canonical_order.order_number }}</div>
                    </div>
                    <div>
                      <span class="text-slate-500">Total:</span>
                      <div class="font-bold text-amber-400"><span>$</span>{{ wizardPreview.canonical_order.total | number }} {{ wizardPreview.canonical_order.currency }}</div>
                    </div>
                    <div>
                      <span class="text-slate-500">Estado:</span>
                      <div class="font-bold text-indigo-400">{{ wizardPreview.canonical_order.status }}</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <span class="text-slate-500">Cliente:</span>
                      <div class="text-slate-200">{{ wizardPreview.canonical_order.customer.name }} ({{ wizardPreview.canonical_order.customer.email }})</div>
                    </div>
                    <div>
                      <span class="text-slate-500">Dirección Canónica:</span>
                      <div class="text-emerald-300 font-bold">{{ wizardPreview.canonical_order.delivery.address }}</div>
                      <div class="text-slate-400">{{ wizardPreview.canonical_order.delivery.city }}, {{ wizardPreview.canonical_order.delivery.region }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- STEP 4: COMMIT & VERSION SNAPSHOT -->
            <div *ngIf="wizardStep === 4" class="space-y-3">
              <div class="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                <div class="font-bold text-slate-200 text-sm">Paso 4: Guardar y Crear Nueva Versión</div>
                <p class="text-slate-400 text-xs">
                  Se generará una nueva versión histórica (v{{ (mappingResult()?.current_version || 1) + 1 }}) con snapshot inmutable para auditoría y rollback.
                </p>

                <div>
                  <label class="block text-slate-400 mb-1">Descripción del Cambio / Motivo de la Versión:</label>
                  <input type="text" [(ngModel)]="wizardCommitDescription" placeholder="ej. Mapeo inicial de tienda, ajuste de dirección para plugin custom" class="form-control text-xs py-2 px-3 bg-slate-900 border-slate-800 w-full" />
                </div>
              </div>
            </div>
          </div>

          <!-- Wizard Footer Navigation Buttons -->
          <div class="flex items-center justify-between pt-3 border-t border-slate-800 flex-shrink-0">
            <button *ngIf="wizardStep > 1" (click)="wizardStep = wizardStep - 1" class="btn btn-secondary btn-sm">
              ⬅️ Anterior
            </button>
            <div *ngIf="wizardStep === 1"></div>

            <div class="flex items-center gap-2">
              <button (click)="showWizard = false" class="btn btn-secondary btn-sm">Cancelar</button>
              <button *ngIf="wizardStep < 4" (click)="advanceWizardStep()" class="btn btn-primary btn-sm">
                Siguiente ➡️
              </button>
              <button *ngIf="wizardStep === 4" (click)="commitWizard()" class="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm">
                💾 Confirmar y Guardar Versión
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- EDIT RULE / ADD MAPPING MODAL -->
      <div *ngIf="showRuleModal" class="modal-backdrop">
        <div class="modal max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="text-base font-bold text-slate-100">
              {{ editingRule.id ? '✏️ Editar Regla de Mapeo' : '➕ Nueva Regla de Mapeo' }}
            </h3>
            <button (click)="showRuleModal = false" class="text-slate-400 hover:text-slate-200">✕</button>
          </div>

          <div class="space-y-3 text-xs">
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

            <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button (click)="showRuleModal = false" class="btn btn-secondary btn-sm">Cancelar</button>
              <button (click)="saveSingleRule()" class="btn btn-primary btn-sm">Guardar Regla</button>
            </div>
          </div>
        </div>
      </div>

      <!-- VERSION HISTORY MODAL -->
      <div *ngIf="showVersionModal" class="modal-backdrop">
        <div class="modal max-w-xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>🕒</span> Historial de Versiones y Rollback
            </h3>
            <button (click)="showVersionModal = false" class="text-slate-400 hover:text-slate-200">✕</button>
          </div>

          <div class="space-y-2 max-h-72 overflow-y-auto">
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

          <div class="flex items-center justify-end pt-3 border-t border-slate-800">
            <button (click)="showVersionModal = false" class="btn btn-secondary btn-sm">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem;
    }
  `]
})
export class DynamicMappingComponent implements OnInit {
  @Input({ required: true }) integration!: Integration;
  @Output() close = new EventEmitter<void>();

  private api = inject(ApiService);
  private toast = inject(ToastService);
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

  ngOnInit() {
    this.loadEffectiveMapping();
    this.loadCanonicalFields();
    this.loadVersions();
  }

  loadEffectiveMapping() {
    this.api.getIntegrationMapping(this.integration.id).subscribe({
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
    this.api.getMappingVersions(this.integration.id).subscribe({
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

  fetchSampleOrder() {
    this.loadingSample.set(true);
    this.api.fetchSampleOrderPayload(this.integration.id).subscribe({
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

    this.api.saveIntegrationMapping(this.integration.id, mappings).subscribe({
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
    this.api.testIntegrationMapping(this.integration.id, this.activeMappings()).subscribe({
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
    this.api.suggestAutoMappings(this.integration.id).subscribe({
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
      this.api.testIntegrationMapping(this.integration.id, candidateMappings).subscribe({
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
    this.api.saveIntegrationMapping(this.integration.id, finalMappings).subscribe({
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

    this.api.saveIntegrationMapping(this.integration.id, mappings).subscribe({
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

    this.api.deleteIntegrationMappingRule(this.integration.id, rule.id).subscribe({
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

    this.api.restoreMappingVersion(this.integration.id, version).subscribe({
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
