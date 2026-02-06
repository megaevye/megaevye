export enum UserRole {
  DRIVER = 'DRIVER',
  PASSENGER = 'PASSENGER'
}

export enum VehicleType {
  CAR = 'CAR',
  MOTO = 'MOTO',
  NONE = 'NONE'
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface ActiveUser {
  id: string;
  role: UserRole;
  vehicleType: VehicleType;
  location: UserLocation;
  destination: string;
  telegramUsername: string;
  createdAt: number;
  distanceToViewer?: number;
  rank?: number;
}