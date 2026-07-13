import { Component, OnInit } from '@angular/core'
import { trigger, transition, style, animate } from '@angular/animations'
import { AnnouncementService } from '../services/announcement.service'
import { Announcement } from '../services/announcements'
import { MatCard, MatCardContent } from '@angular/material/card'
import { MatIconButton } from '@angular/material/button'
import { MatIcon } from '@angular/material/icon'
import { MatTooltip } from '@angular/material/tooltip'

@Component({
  selector: 'app-announcement-banner',
  templateUrl: './announcement-banner.component.html',
  styleUrl: './announcement-banner.component.css',
  imports: [MatCard, MatCardContent, MatIconButton, MatIcon, MatTooltip],
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ opacity: 0, height: '0px', overflow: 'hidden' }),
        animate('300ms ease-out', style({ opacity: 1, height: '*' })),
      ]),
      transition(':leave', [animate('200ms ease-in', style({ opacity: 0, height: '0px', overflow: 'hidden' }))]),
    ]),
  ],
})
export class AnnouncementBannerComponent implements OnInit {
  announcements: Announcement[] = []

  constructor(private announcementService: AnnouncementService) {}

  ngOnInit(): void {
    this.announcements = this.announcementService.getActiveAnnouncements()
  }

  dismiss(id: string): void {
    this.announcementService.dismiss(id)
    this.announcements = this.announcements.filter((a) => a.id !== id)
  }

  dismissAll(): void {
    this.announcementService.dismissAll()
    this.announcements = []
  }

  getSeverityClass(severity: string): string {
    switch (severity) {
      case 'breaking':
        return 'severity-breaking'
      case 'warning':
        return 'severity-warning'
      default:
        return 'severity-info'
    }
  }
}
