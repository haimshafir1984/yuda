import { prisma } from '../src/db';

/** מנקה את כל הטבלאות לפי סדר תלויות (בסיס נתונים נפרד לבדיקות בלבד) */
export async function resetDb() {
  await prisma.memberNote.deleteMany();
  await prisma.treatmentMeeting.deleteMany();
  await prisma.treatmentTask.deleteMany();
  await prisma.socialWorkProcessTreatment.deleteMany();
  await prisma.serviceRequestTreatment.deleteMany();
  await prisma.socialWorkEvent.deleteMany();
  await prisma.socialWorkReport.deleteMany();
  await prisma.socialWorkIntervention.deleteMany();
  await prisma.socialWorkMeeting.deleteMany();
  await prisma.socialWorkProcess.deleteMany();
  await prisma.serviceRequestEvent.deleteMany();
  await prisma.serviceRequest.deleteMany();
  await prisma.treatmentSocialWorkerReport.deleteMany();
  await prisma.treatmentMonthlyReport.deleteMany();
  await prisma.treatmentExtension.deleteMany();
  await prisma.treatmentEvent.deleteMany();
  await prisma.treatmentStatusHistory.deleteMany();
  await prisma.treatmentTherapistHistory.deleteMany();
  await prisma.psychologicalTreatment.deleteMany();
  await prisma.therapist.deleteMany();
  await prisma.registrationAnswer.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.memberRestriction.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.workshopQuestion.deleteMany();
  await prisma.workshopSession.deleteMany();
  await prisma.workshop.deleteMany();
  await prisma.member.deleteMany();
}
