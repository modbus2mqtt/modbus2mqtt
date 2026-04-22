import { Routes } from '@angular/router'
import { SpecificationComponent } from '@app/specification/specification/specification.component'
import { AuthGuardService } from '@app/services/auth-guard.service'
import { SelectModbusComponent } from '@app/select-modbus/select-modbus.component'
import { SelectSlaveComponent } from '@app/select-slave/select-slave.component'
import { RootRoutingComponent } from '@app/root-routing/root-routing.component'
import { SpecificationsComponent } from '@app/specifications/specifications.component'
import { RoutingNames } from '@shared/server'
export const APP_ROUTES: Routes = [
  { path: '', component: RootRoutingComponent, pathMatch: 'full' },
  {
    path: RoutingNames.configure,
    loadComponent: () => import('@app/configure/configure.component').then((m) => m.ConfigureComponent),
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.busses,
    component: SelectModbusComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.specifications,
    component: SpecificationsComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.slaves + '/:busid',
    component: SelectSlaveComponent,
    canActivate: [AuthGuardService],
  },
  {
    path: RoutingNames.specification + '/:busid/:slaveid/:disabled',
    canActivate: [AuthGuardService],
    loadComponent: () => import('@app/specification/specification/specification.component').then((m) => m.SpecificationComponent),
    canDeactivate: [(component: SpecificationComponent) => !component.canDeactivate()],
  },
]
